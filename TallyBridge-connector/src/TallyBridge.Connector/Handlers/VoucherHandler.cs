using System.Collections.Concurrent;
using TallyBridge.Connector.Tally;
using TallyBridge.Connector.Xml;
using TallyBridge.Contracts;

namespace TallyBridge.Connector.Handlers;

public sealed class VoucherHandler(TallyClient tally, ILogger<VoucherHandler> log)
{
    // In-flight only (removed on completion). Blocks the same request running twice at once. Not a history.
    static readonly ConcurrentDictionary<string, byte> InFlight = new();
    static VoucherResult R(VoucherRequest r, VoucherStatus s, string m) => new(r.CorrelationId, s, m);

    public async Task<VoucherResult> CreateAsync(VoucherRequest r, CancellationToken ct)
    {
        if (!InFlight.TryAdd(r.CorrelationId, 0)) return R(r, VoucherStatus.Rejected, "This request is already being processed.");
        var sent = false;
        try
        {
            if (Validate(r) is { } bad) return R(r, VoucherStatus.Rejected, bad);

            if (!(await tally.GetCompaniesAsync(ct)).Contains(r.Company, StringComparer.OrdinalIgnoreCase))
                return R(r, VoucherStatus.Rejected, $"Company \"{r.Company}\" is not open in TallyPrime.");

            var ledgers = await tally.GetLedgersAsync(r.Company, ct);
            var missing = r.Lines.Select(l => l.Ledger).Append(r.PartyLedger).Where(n => !ledgers.Contains(n)).Distinct().ToList();
            if (missing.Count > 0) return R(r, VoucherStatus.Rejected, "Ledger not found in Tally: " + string.Join(", ", missing));

            // Never blindly retry: if the earlier attempt was Unknown, look in Tally first.
            if (r.IsRetry && await tally.VoucherExistsAsync(r.Company, r.VoucherType, r.VoucherNumber, r.Date, r.PartyLedger, ct))
                return R(r, VoucherStatus.Exists, "This voucher is already in Tally. Nothing was written.");

            sent = true;
            var o = TallyResponse.ParseImport(await tally.PostAsync(VoucherXmlBuilder.Build(r), ct));

            if (!o.Parsed) return R(r, VoucherStatus.Unknown, "Tally's reply could not be read. Check Tally before retrying.");
            if (o.Created > 0 && o.Errors == 0 && o.Exceptions == 0 && o.LineError is null)
                return R(r, VoucherStatus.Created, "Voucher created in Tally.");
            if (o.Errors > 0 || o.Exceptions > 0 || o.LineError is not null)
                return R(r, VoucherStatus.Failed, o.LineError ?? "Tally rejected the voucher.");
            return R(r, VoucherStatus.Unknown, "Tally gave no confirmation. Check Tally before retrying.");
        }
        catch (TallyUnreachableException ex) { return R(r, VoucherStatus.Failed, ex.Message); }
        catch (Exception ex) when (ex is TallyUncertainException or OperationCanceledException)
        {
            log.LogWarning("Uncertain outcome for {Id} ({Type})", r.CorrelationId, ex.GetType().Name);
            return R(r, sent ? VoucherStatus.Unknown : VoucherStatus.Failed,
                sent ? "Tally did not confirm. Use Check in Tally before retrying." : "Tally did not respond.");
        }
        finally { InFlight.TryRemove(r.CorrelationId, out _); }
    }

    /// <summary>Read-only existence check used by the "Check in Tally" button.</summary>
    public async Task<VoucherResult> VerifyAsync(VoucherRequest r, CancellationToken ct)
    {
        try
        {
            return await tally.VoucherExistsAsync(r.Company, r.VoucherType, r.VoucherNumber, r.Date, r.PartyLedger, ct)
                ? R(r, VoucherStatus.Exists, "Voucher found in Tally.")
                : R(r, VoucherStatus.Rejected, "Voucher not found in Tally. Safe to write again.");
        }
        catch (TallyUnreachableException ex) { return R(r, VoucherStatus.Failed, ex.Message); }
        catch (Exception) { return R(r, VoucherStatus.Unknown, "Could not check Tally."); }
    }

    public async Task<List<string>> LedgersAsync(string company, CancellationToken ct)
        => (await tally.GetLedgersAsync(company, ct)).Order().ToList();

    static string? Validate(VoucherRequest r)
    {
        if (r.VoucherType is not ("Sales" or "Purchase")) return "Only Sales and Purchase vouchers are supported.";
        if (string.IsNullOrWhiteSpace(r.Company) || string.IsNullOrWhiteSpace(r.PartyLedger) || string.IsNullOrWhiteSpace(r.VoucherNumber))
            return "Company, party ledger and invoice number are required.";
        if (r.Lines is not { Count: >= 2 } || r.Lines.Any(l => l.Amount < 0 || string.IsNullOrWhiteSpace(l.Ledger))) return "Voucher lines are invalid.";
        var dr = r.Lines.Where(l => l.IsDebit).Sum(l => Math.Round(l.Amount, 2));
        var cr = r.Lines.Where(l => !l.IsDebit).Sum(l => Math.Round(l.Amount, 2));
        if (dr != cr || dr == 0) return $"Voucher does not balance (debit {dr:0.00}, credit {cr:0.00}). Check round off.";
        var partyIsDebit = r.VoucherType == "Sales";
        if (!r.Lines.Any(l => l.IsDebit == partyIsDebit && string.Equals(l.Ledger, r.PartyLedger, StringComparison.OrdinalIgnoreCase)))
            return "Party ledger must be on the " + (partyIsDebit ? "debit" : "credit") + " side.";
        return null;
    }
}
