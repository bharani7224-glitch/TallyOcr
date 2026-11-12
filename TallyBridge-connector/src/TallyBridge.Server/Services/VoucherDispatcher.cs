using System.Collections.Concurrent;
using System.Globalization;
using System.Text;
using System.Xml.Linq;
using Microsoft.AspNetCore.SignalR;
using TallyBridge.Contracts;
using TallyBridge.Server.Hubs;
using TallyBridge.Server.Models;

namespace TallyBridge.Server.Services;

public interface IVoucherDispatcher
{
    Task<VoucherResult> DispatchAsync(VoucherRequest request, string? targetHost = null, int? targetPort = null, CancellationToken ct = default);
    void CompleteVoucher(string correlationId, VoucherResult result);
    Task<List<string>> QueryCompaniesAsync(CancellationToken ct = default);
    Task<List<string>> QueryCompaniesAsync(string? targetHost, int? targetPort, CancellationToken ct = default);
    Task<List<TallyLedgerItemDto>> QueryLedgersAsync(string? companyName, CancellationToken ct = default);
    Task<List<TallyLedgerItemDto>> QueryLedgersAsync(string? companyName, string? targetHost, int? targetPort, CancellationToken ct = default);
}

public sealed class VoucherDispatcher : IVoucherDispatcher
{
    private readonly IHubContext<ConnectorHub> _hub;
    private readonly IConnectorRegistry _registry;
    private readonly HttpClient _http;
    private readonly ILogger<VoucherDispatcher> _logger;

    private readonly ConcurrentDictionary<string, TaskCompletionSource<VoucherResult>> _pending = new();

    public VoucherDispatcher(
        IHubContext<ConnectorHub> hub,
        IConnectorRegistry registry,
        IHttpClientFactory httpFactory,
        ILogger<VoucherDispatcher> logger)
    {
        _hub = hub;
        _registry = registry;
        _http = httpFactory.CreateClient("TallyDirect");
        _logger = logger;
    }

    public void CompleteVoucher(string correlationId, VoucherResult result)
    {
        if (_pending.TryRemove(correlationId, out var tcs))
        {
            tcs.TrySetResult(result);
        }
    }

    public Task<List<string>> QueryCompaniesAsync(CancellationToken ct = default)
        => QueryCompaniesAsync(null, null, ct);

    public async Task<List<string>> QueryCompaniesAsync(string? targetHost, int? targetPort, CancellationToken ct = default)
    {
        var isExplicitRemote = !string.IsNullOrWhiteSpace(targetHost)
            && !targetHost.Trim().Equals("127.0.0.1", StringComparison.OrdinalIgnoreCase)
            && !targetHost.Trim().Equals("localhost", StringComparison.OrdinalIgnoreCase);

        // 1. Check connector registry first if not explicitly querying remote host
        if (!isExplicitRemote)
        {
            var active = _registry.GetActiveCompanies();
            if (active.Count > 0)
            {
                return active;
            }
        }

        // 2. Direct local/LAN query to Tally
        var host = !string.IsNullOrWhiteSpace(targetHost) ? targetHost.Trim() : "127.0.0.1";
        var port = targetPort.HasValue && targetPort > 0 ? targetPort.Value : 9000;
        var endpoint = $"http://{host}:{port}";

        try
        {
            var xml = @"<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>List of Companies</ID></HEADER><BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES><TDL><TDLMESSAGE><COLLECTION NAME=""List of Companies""><TYPE>Company</TYPE><FETCH>Name</FETCH></COLLECTION></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>";
            using var req = new HttpRequestMessage(HttpMethod.Post, endpoint)
            {
                Content = new StringContent(xml, Encoding.UTF8, "text/xml")
            };
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(TimeSpan.FromSeconds(3));

            var res = await _http.SendAsync(req, cts.Token);
            if (res.IsSuccessStatusCode)
            {
                var content = await res.Content.ReadAsStringAsync(cts.Token);
                var doc = XDocument.Parse(content);
                var names = doc.Descendants("COMPANY")
                    .Select(e => e.Attribute("NAME")?.Value ?? e.Element("NAME")?.Value)
                    .Where(n => !string.IsNullOrWhiteSpace(n))
                    .Select(n => n!.Trim())
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToList();

                if (names.Count > 0)
                {
                    return names;
                }
            }
        }
        catch
        {
            // Direct Tally not reachable
        }

        // 3. Fallback to registry if direct failed
        if (isExplicitRemote)
        {
            var fallback = _registry.GetActiveCompanies();
            if (fallback.Count > 0) return fallback;
        }

        return new List<string>();
    }

    public Task<List<TallyLedgerItemDto>> QueryLedgersAsync(string? companyName, CancellationToken ct = default)
        => QueryLedgersAsync(companyName, null, null, ct);

    public async Task<List<TallyLedgerItemDto>> QueryLedgersAsync(string? companyName, string? targetHost, int? targetPort, CancellationToken ct = default)
    {
        var targetCompany = !string.IsNullOrWhiteSpace(companyName)
            ? companyName.Trim()
            : _registry.GetActiveCompanies().FirstOrDefault();

        var host = !string.IsNullOrWhiteSpace(targetHost) ? targetHost.Trim() : "127.0.0.1";
        var port = targetPort.HasValue && targetPort > 0 ? targetPort.Value : 9000;
        var endpoint = $"http://{host}:{port}";

        var sb = new StringBuilder();
        sb.AppendLine("<ENVELOPE>");
        sb.AppendLine("  <HEADER>");
        sb.AppendLine("    <VERSION>1</VERSION>");
        sb.AppendLine("    <TALLYREQUEST>EXPORT</TALLYREQUEST>");
        sb.AppendLine("    <TYPE>COLLECTION</TYPE>");
        sb.AppendLine("    <ID>LedgerCollectionWithParent</ID>");
        sb.AppendLine("  </HEADER>");
        sb.AppendLine("  <BODY>");
        sb.AppendLine("    <DESC>");
        sb.AppendLine("      <STATICVARIABLES>");
        sb.AppendLine("        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>");
        if (!string.IsNullOrWhiteSpace(targetCompany))
        {
            sb.AppendLine($"        <SVCURRENTCOMPANY>{System.Security.SecurityElement.Escape(targetCompany)}</SVCURRENTCOMPANY>");
        }
        sb.AppendLine("      </STATICVARIABLES>");
        sb.AppendLine("      <TDL>");
        sb.AppendLine("        <TDLMESSAGE>");
        sb.AppendLine("          <COLLECTION NAME=\"LedgerCollectionWithParent\" ISMODIFY=\"No\">");
        sb.AppendLine("            <TYPE>Ledger</TYPE>");
        sb.AppendLine("            <FETCH>Name, Parent, TaxType, GstDutyHead, PartyGstin, StateName, LedStateName</FETCH>");
        sb.AppendLine("          </COLLECTION>");
        sb.AppendLine("        </TDLMESSAGE>");
        sb.AppendLine("      </TDL>");
        sb.AppendLine("    </DESC>");
        sb.AppendLine("  </BODY>");
        sb.AppendLine("</ENVELOPE>");

        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Post, endpoint)
            {
                Content = new StringContent(sb.ToString(), Encoding.UTF8, "text/xml")
            };
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(TimeSpan.FromSeconds(10));

            var res = await _http.SendAsync(req, cts.Token);
            if (res.IsSuccessStatusCode)
            {
                var xml = await res.Content.ReadAsStringAsync(cts.Token);
                return ParseLedgersFromXml(xml);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to query ledgers from Tally on {Endpoint}", endpoint);
        }

        return new List<TallyLedgerItemDto>();
    }

    private static readonly System.Text.RegularExpressions.Regex InvalidXmlChars = new(
        @"[\x00-\x08\x0B\x0C\x0E-\x1F]|&#(?:[0-8]|1[12]|1[4-9]|2\d|3[01]);",
        System.Text.RegularExpressions.RegexOptions.Compiled);

    private static List<TallyLedgerItemDto> ParseLedgersFromXml(string xml)
    {
        var list = new List<TallyLedgerItemDto>();
        try
        {
            var cleanXml = InvalidXmlChars.Replace(xml, "");
            var doc = XDocument.Parse(cleanXml);
            var ledgerNodes = doc.Descendants().Where(e => e.Name.LocalName.Equals("LEDGER", StringComparison.OrdinalIgnoreCase));

            foreach (var node in ledgerNodes)
            {
                var name = (string?)node.Attribute("NAME") ?? node.Element("NAME")?.Value;
                if (string.IsNullOrWhiteSpace(name))
                {
                    name = node.Descendants().FirstOrDefault(d => d.Name.LocalName.Equals("NAME", StringComparison.OrdinalIgnoreCase))?.Value;
                }
                if (string.IsNullOrWhiteSpace(name)) continue;

                var parent = node.Elements().FirstOrDefault(e => e.Name.LocalName.Equals("PARENT", StringComparison.OrdinalIgnoreCase))?.Value ?? "";
                var taxType = node.Elements().FirstOrDefault(e => e.Name.LocalName.Equals("TAXTYPE", StringComparison.OrdinalIgnoreCase))?.Value;
                var gstDuty = node.Elements().FirstOrDefault(e => e.Name.LocalName.Equals("GSTDUTYHEAD", StringComparison.OrdinalIgnoreCase))?.Value;
                var gstin = node.Elements().FirstOrDefault(e => e.Name.LocalName.Equals("PARTYGSTIN", StringComparison.OrdinalIgnoreCase))?.Value;
                var state = node.Elements().FirstOrDefault(e => e.Name.LocalName.Equals("STATENAME", StringComparison.OrdinalIgnoreCase))?.Value
                            ?? node.Elements().FirstOrDefault(e => e.Name.LocalName.Equals("LEDSTATENAME", StringComparison.OrdinalIgnoreCase))?.Value;

                list.Add(new TallyLedgerItemDto
                {
                    Name = name.Trim(),
                    ParentGroup = parent.Trim(),
                    PartyGstin = string.IsNullOrWhiteSpace(gstin) ? null : gstin.Trim(),
                    TaxType = string.IsNullOrWhiteSpace(taxType) ? null : taxType.Trim(),
                    GstDutyHead = string.IsNullOrWhiteSpace(gstDuty) ? null : gstDuty.Trim(),
                    StateName = string.IsNullOrWhiteSpace(state) ? null : state.Trim()
                });
            }
        }
        catch { }

        return list;
    }

    public async Task<VoucherResult> DispatchAsync(VoucherRequest request, string? targetHost = null, int? targetPort = null, CancellationToken ct = default)
    {
        var host = !string.IsNullOrWhiteSpace(targetHost) ? targetHost.Trim() : "127.0.0.1";
        var port = targetPort.HasValue && targetPort > 0 ? targetPort.Value : 9000;
        var endpoint = $"http://{host}:{port}";

        var isExplicitRemote = !host.Equals("127.0.0.1", StringComparison.OrdinalIgnoreCase)
            && !host.Equals("localhost", StringComparison.OrdinalIgnoreCase);

        // 1. Try SignalR Connector route ONLY if host is local (127.0.0.1 / localhost)
        if (!isExplicitRemote)
        {
            var session = _registry.FindByCompany(request.Company);
            if (session != null)
            {
                _logger.LogInformation("Dispatching Voucher {VoucherNo} via Connector {ConnectionId} (Device: {Device})",
                    request.VoucherNumber, session.ConnectionId, session.DeviceId);

                var tcs = new TaskCompletionSource<VoucherResult>(TaskCreationOptions.RunContinuationsAsynchronously);
                _pending[request.CorrelationId] = tcs;

                try
                {
                    // Send command to the connected desktop daemon
                    await _hub.Clients.Client(session.ConnectionId)
                        .SendAsync(HubMethods.CreateVoucher, request, ct);

                    using var timeoutCts = new CancellationTokenSource(TimeSpan.FromSeconds(45));
                    using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(ct, timeoutCts.Token);

                    var completedTask = await Task.WhenAny(tcs.Task, Task.Delay(Timeout.Infinite, linkedCts.Token));
                    if (completedTask == tcs.Task)
                    {
                        return await tcs.Task;
                    }
                    else
                    {
                        return new VoucherResult(request.CorrelationId, VoucherStatus.Failed, "Connector response timed out after 45 seconds.");
                    }
                }
                catch (OperationCanceledException)
                {
                    return new VoucherResult(request.CorrelationId, VoucherStatus.Failed, "Voucher dispatch cancelled or timed out.");
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to dispatch voucher to connector {ConnectionId}", session.ConnectionId);
                    return new VoucherResult(request.CorrelationId, VoucherStatus.Failed, $"Connector dispatch failed: {ex.Message}");
                }
                finally
                {
                    _pending.TryRemove(request.CorrelationId, out _);
                }
            }
        }

        // 2. Direct Tally route (writes directly to target host:port, e.g. http://192.23.2.18:9000)
        _logger.LogInformation("Writing voucher {VoucherNo} directly to Tally at {Endpoint} for company {Company}...", request.VoucherNumber, endpoint, request.Company);
        try
        {
            var xml = BuildTallyXml(request);
            using var req = new HttpRequestMessage(HttpMethod.Post, endpoint)
            {
                Content = new StringContent(xml, Encoding.UTF8, "text/xml")
            };
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(TimeSpan.FromSeconds(15));

            var res = await _http.SendAsync(req, cts.Token);
            var body = await res.Content.ReadAsStringAsync(cts.Token);

            if (body.Contains("<CREATED>1</CREATED>") || body.Contains("<CREATED>") && !body.Contains("<CREATED>0</CREATED>"))
            {
                return new VoucherResult(request.CorrelationId, VoucherStatus.Created, $"Voucher {request.VoucherNumber} created directly in Tally at {endpoint}.");
            }

            if (body.Contains("<LINEERROR>"))
            {
                var match = System.Text.RegularExpressions.Regex.Match(body, @"<LINEERROR>(.*?)</LINEERROR>");
                var err = match.Success ? match.Groups[1].Value : "Tally rejected voucher.";
                return new VoucherResult(request.CorrelationId, VoucherStatus.Failed, err);
            }

            return new VoucherResult(request.CorrelationId, VoucherStatus.Failed, "Tally returned unconfirmed status.");
        }
        catch (Exception ex)
        {
            return new VoucherResult(request.CorrelationId, VoucherStatus.Failed,
                $"Neither TallyBridge Connector nor TallyPrime ({endpoint}) was reachable: {ex.Message}");
        }
    }

    private static string BuildTallyXml(VoucherRequest r)
    {
        var d = r.Date.ToString("yyyyMMdd");
        var sb = new StringBuilder();
        sb.AppendLine("<ENVELOPE>");
        sb.AppendLine("  <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>");
        sb.AppendLine("  <BODY><IMPORTDATA>");
        sb.AppendLine("    <REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME>");
        sb.AppendLine($"      <STATICVARIABLES><SVCURRENTCOMPANY>{System.Security.SecurityElement.Escape(r.Company)}</SVCURRENTCOMPANY></STATICVARIABLES>");
        sb.AppendLine("    </REQUESTDESC>");
        sb.AppendLine("    <REQUESTDATA>");
        sb.AppendLine("      <TALLYMESSAGE xmlns:UDF=\"TallyUDF\">");
        sb.AppendLine($"        <VOUCHER VCHTYPE=\"{r.VoucherType}\" ACTION=\"Create\" OBJVIEW=\"Accounting Voucher View\">");
        sb.AppendLine($"          <DATE>{d}</DATE>");
        sb.AppendLine($"          <EFFECTIVEDATE>{d}</EFFECTIVEDATE>");
        sb.AppendLine($"          <VOUCHERTYPENAME>{r.VoucherType}</VOUCHERTYPENAME>");
        sb.AppendLine($"          <VOUCHERNUMBER>{System.Security.SecurityElement.Escape(r.VoucherNumber)}</VOUCHERNUMBER>");
        sb.AppendLine($"          <REFERENCE>{System.Security.SecurityElement.Escape(r.VoucherNumber)}</REFERENCE>");
        sb.AppendLine($"          <REFERENCEDATE>{d}</REFERENCEDATE>");
        sb.AppendLine($"          <PARTYLEDGERNAME>{System.Security.SecurityElement.Escape(r.PartyLedger)}</PARTYLEDGERNAME>");
        sb.AppendLine("          <PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>");
        sb.AppendLine("          <ISINVOICE>Yes</ISINVOICE>");
        sb.AppendLine("          <ISACCOUNTINGVOUCHER>Yes</ISACCOUNTINGVOUCHER>");
        sb.AppendLine($"          <NARRATION>{System.Security.SecurityElement.Escape(r.Narration ?? "")}</NARRATION>");

        foreach (var l in r.Lines.Where(line => line.Amount != 0))
        {
            var amt = (l.IsDebit ? -l.Amount : l.Amount).ToString("0.00", CultureInfo.InvariantCulture);
            var isParty = string.Equals(l.Ledger, r.PartyLedger, StringComparison.OrdinalIgnoreCase);
            sb.AppendLine("          <ALLLEDGERENTRIES.LIST>");
            sb.AppendLine($"            <LEDGERNAME>{System.Security.SecurityElement.Escape(l.Ledger)}</LEDGERNAME>");
            sb.AppendLine($"            <ISDEEMEDPOSITIVE>{(l.IsDebit ? "Yes" : "No")}</ISDEEMEDPOSITIVE>");
            sb.AppendLine($"            <ISPARTYLEDGER>{(isParty ? "Yes" : "No")}</ISPARTYLEDGER>");
            sb.AppendLine($"            <AMOUNT>{amt}</AMOUNT>");
            sb.AppendLine("          </ALLLEDGERENTRIES.LIST>");
        }

        sb.AppendLine("        </VOUCHER>");
        sb.AppendLine("      </TALLYMESSAGE>");
        sb.AppendLine("    </REQUESTDATA>");
        sb.AppendLine("  </IMPORTDATA></BODY>");
        sb.AppendLine("</ENVELOPE>");

        return sb.ToString();
    }
}

