namespace TallyBridge.Contracts;

public enum VoucherStatus { Created, Exists, Rejected, Failed, Unknown }

/// <summary>One ledger line. Amount is always positive; IsDebit decides the side.</summary>
public sealed record PostingLine(string Ledger, decimal Amount, bool IsDebit);

public sealed record VoucherRequest(
    string CorrelationId, string Company, string VoucherType, string VoucherNumber,
    DateOnly Date, string PartyLedger, string? Narration, List<PostingLine> Lines,
    bool IsRetry = false);

public sealed record VoucherResult(string CorrelationId, VoucherStatus Status, string Message);

public sealed record ConnectorState(string DeviceId, bool TallyRunning, bool TallyReachable, List<string> Companies);

/// <summary>Hub method names shared by web and connector (single source of truth).</summary>
public static class HubMethods
{
    // Server -> connector (client results)
    public const string CreateVoucher = "CreateVoucher";
    public const string VerifyVoucher = "VerifyVoucher";
    public const string GetLedgers = "GetLedgers";
    // Connector -> server
    public const string UpdateState = "UpdateState";
    public const string VoucherResult = "VoucherResult";
}
