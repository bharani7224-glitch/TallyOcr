using System.Diagnostics;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Text;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using TallyBridge.Server.Models;

namespace TallyBridge.Server.Services;

public interface ITallyDiagnosticService
{
    Task<TallyConnectionResponseDto> TestConnectivityAsync(
        string? host,
        int port = 9000,
        string? companyName = null,
        CancellationToken ct = default);
}

public sealed partial class TallyDiagnosticService : ITallyDiagnosticService
{
    private readonly HttpClient _http;
    private readonly IConnectorRegistry _registry;
    private readonly ILogger<TallyDiagnosticService> _logger;

    private static readonly Regex InvalidXmlChars = new(
        @"[\x00-\x08\x0B\x0C\x0E-\x1F]|&#(?:[0-8]|1[12]|1[4-9]|2\d|3[01]);",
        RegexOptions.Compiled);

    public TallyDiagnosticService(
        IHttpClientFactory httpFactory,
        IConnectorRegistry registry,
        ILogger<TallyDiagnosticService> logger)
    {
        _http = httpFactory.CreateClient("TallyDirect");
        _registry = registry;
        _logger = logger;
    }

    public async Task<TallyConnectionResponseDto> TestConnectivityAsync(
        string? host,
        int port = 9000,
        string? companyName = null,
        CancellationToken ct = default)
    {
        var targetHost = CleanHost(host);
        var targetPort = port > 0 ? port : 9000;
        var endpoint = $"http://{targetHost}:{targetPort}";
        var sw = Stopwatch.StartNew();

        // 1. SSRF Check
        if (IsBlockedSsrf(targetHost))
        {
            sw.Stop();
            return new TallyConnectionResponseDto
            {
                Connected = false,
                ErrorCode = "SSRF_DETECTED",
                Host = targetHost,
                Port = targetPort,
                Endpoint = endpoint,
                Status = 0,
                LatencyMs = sw.ElapsedMilliseconds,
                Message = "Connection rejected: target IP/host is restricted by security policy.",
                Errors = new List<string> { "Restricted IP address or cloud metadata endpoint." }
            };
        }

        var isLoopback = targetHost.Equals("localhost", StringComparison.OrdinalIgnoreCase) ||
                         targetHost == "127.0.0.1" ||
                         targetHost == "::1";

        // 2. Network Reachability (Ping & TCP Handshake)
        if (!isLoopback)
        {
            var (pingSuccess, pingErr) = await PingHostAsync(targetHost, 2000);
            if (!pingSuccess)
            {
                var tcpStatus = await CheckTcpPortAsync(targetHost, targetPort, 1500, ct);
                if (tcpStatus == TcpCheckStatus.ConnectionRefused)
                {
                    sw.Stop();
                    return new TallyConnectionResponseDto
                    {
                        Connected = false,
                        ErrorCode = "TALLY_NOT_RUNNING",
                        Host = targetHost,
                        Port = targetPort,
                        Endpoint = endpoint,
                        Status = 0,
                        LatencyMs = sw.ElapsedMilliseconds,
                        Message = $"The target system is reachable, but TallyPrime is not running or the Tally HTTP Server is not available on port {targetPort}.",
                        Errors = new List<string> { $"Target machine {targetHost} is reachable, but port {targetPort} refused connection." }
                    };
                }
                else if (tcpStatus != TcpCheckStatus.Connected)
                {
                    sw.Stop();
                    return new TallyConnectionResponseDto
                    {
                        Connected = false,
                        ErrorCode = "SYSTEM_UNREACHABLE",
                        Host = targetHost,
                        Port = targetPort,
                        Endpoint = endpoint,
                        Status = 0,
                        LatencyMs = sw.ElapsedMilliseconds,
                        Message = $"Unable to connect to the target system {targetHost}. Please check the network connection, IP address, or firewall.",
                        Errors = new List<string> { $"Unable to connect to the target system {targetHost}: {pingErr ?? "Network host unreachable."}" }
                    };
                }
            }
        }

        // 3. Tally HTTP Server Probe & Companies Query
        try
        {
            // First check if port is open via quick probe
            var portStatus = await CheckTcpPortAsync(targetHost, targetPort, 1500, ct);
            if (portStatus == TcpCheckStatus.ConnectionRefused)
            {
                sw.Stop();
                return new TallyConnectionResponseDto
                {
                    Connected = false,
                    ErrorCode = "TALLY_NOT_RUNNING",
                    Host = targetHost,
                    Port = targetPort,
                    Endpoint = endpoint,
                    Status = 0,
                    LatencyMs = sw.ElapsedMilliseconds,
                    Message = $"The target system is reachable, but TallyPrime is not running or the Tally HTTP Server is not available on port {targetPort}.",
                    Errors = new List<string> { $"Target machine {targetHost} is reachable, but port {targetPort} refused connection." }
                };
            }
            else if (portStatus == TcpCheckStatus.Unreachable)
            {
                sw.Stop();
                return new TallyConnectionResponseDto
                {
                    Connected = false,
                    ErrorCode = "SYSTEM_UNREACHABLE",
                    Host = targetHost,
                    Port = targetPort,
                    Endpoint = endpoint,
                    Status = 0,
                    LatencyMs = sw.ElapsedMilliseconds,
                    Message = $"Unable to connect to the target system {targetHost}. Please check the network connection, IP address, or firewall.",
                    Errors = new List<string> { $"Port {targetPort} is unreachable on {targetHost}." }
                };
            }

            // Fetch open companies
            var companies = await FetchCompaniesFromEndpointAsync(endpoint, ct);
            if (companies.Count == 0 && isLoopback)
            {
                // Also check if any companies are registered via Connector
                companies = _registry.GetActiveCompanies();
            }

            var availableCompanies = new List<TallyCompanyDto>();
            foreach (var co in companies)
            {
                var taxUnits = await FetchTaxUnitsForCompanyAsync(endpoint, co, ct);
                var primaryTaxUnit = taxUnits.FirstOrDefault();
                availableCompanies.Add(new TallyCompanyDto
                {
                    CompanyName = co,
                    Gstin = primaryTaxUnit?.Gstin,
                    State = primaryTaxUnit?.State
                });
            }

            var targetCo = !string.IsNullOrWhiteSpace(companyName)
                ? availableCompanies.FirstOrDefault(c => string.Equals(c.CompanyName, companyName.Trim(), StringComparison.OrdinalIgnoreCase))?.CompanyName ?? companyName.Trim()
                : availableCompanies.FirstOrDefault()?.CompanyName;

            var matchedCompany = availableCompanies.FirstOrDefault(c => string.Equals(c.CompanyName, targetCo, StringComparison.OrdinalIgnoreCase))
                                 ?? availableCompanies.FirstOrDefault();

            var companyTaxUnits = !string.IsNullOrWhiteSpace(targetCo)
                ? await FetchTaxUnitsForCompanyAsync(endpoint, targetCo, ct)
                : new List<TallyTaxUnitDto>();

            var companyDetails = matchedCompany != null
                ? new TallyCompanyDetailsDto
                {
                    CompanyName = matchedCompany.CompanyName,
                    Gstin = matchedCompany.Gstin,
                    State = matchedCompany.State,
                    TaxUnits = companyTaxUnits
                }
                : null;

            sw.Stop();

            return new TallyConnectionResponseDto
            {
                Connected = true,
                ErrorCode = null,
                Host = targetHost,
                Port = targetPort,
                CompanyName = targetCo ?? companyDetails?.CompanyName,
                Endpoint = endpoint,
                Status = 1,
                LatencyMs = sw.ElapsedMilliseconds,
                Message = "Successfully connected to TallyPrime.",
                Company = companyDetails,
                AvailableCompanies = availableCompanies,
                TaxUnits = companyTaxUnits
            };
        }
        catch (HttpRequestException ex)
        {
            sw.Stop();
            _logger.LogWarning(ex, "Tally HTTP connection error on {Endpoint}", endpoint);
            return new TallyConnectionResponseDto
            {
                Connected = false,
                ErrorCode = "TALLY_NOT_RUNNING",
                Host = targetHost,
                Port = targetPort,
                Endpoint = endpoint,
                Status = 0,
                LatencyMs = sw.ElapsedMilliseconds,
                Message = $"The target system is reachable, but TallyPrime is not running or the Tally HTTP Server is not available on port {targetPort}.",
                Errors = new List<string> { ex.Message }
            };
        }
        catch (TaskCanceledException)
        {
            sw.Stop();
            return new TallyConnectionResponseDto
            {
                Connected = false,
                ErrorCode = "SYSTEM_UNREACHABLE",
                Host = targetHost,
                Port = targetPort,
                Endpoint = endpoint,
                Status = 0,
                LatencyMs = sw.ElapsedMilliseconds,
                Message = $"Request timed out connecting to {endpoint}.",
                Errors = new List<string> { "Connection timed out." }
            };
        }
        catch (Exception ex)
        {
            sw.Stop();
            _logger.LogError(ex, "Unexpected error testing Tally connectivity on {Endpoint}", endpoint);
            return new TallyConnectionResponseDto
            {
                Connected = false,
                ErrorCode = "TALLY_ERROR",
                Host = targetHost,
                Port = targetPort,
                Endpoint = endpoint,
                Status = 0,
                LatencyMs = sw.ElapsedMilliseconds,
                Message = $"Tally connection failed: {ex.Message}",
                Errors = new List<string> { ex.Message }
            };
        }
    }

    private async Task<List<string>> FetchCompaniesFromEndpointAsync(string endpoint, CancellationToken ct)
    {
        var list = new List<string>();
        // Request 1: Try Collection Company
        var xml1 = @"<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>EXPORT</TALLYREQUEST><TYPE>COLLECTION</TYPE><ID>Company</ID></HEADER><BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES></DESC></BODY></ENVELOPE>";
        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Post, endpoint)
            {
                Content = new StringContent(xml1, Encoding.UTF8, "text/xml")
            };
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(TimeSpan.FromSeconds(4));

            var res = await _http.SendAsync(req, cts.Token);
            if (res.IsSuccessStatusCode)
            {
                var body = await res.Content.ReadAsStringAsync(cts.Token);
                var clean = InvalidXmlChars.Replace(body, "");
                var doc = XDocument.Parse(clean);
                var names = doc.Descendants("COMPANY")
                    .Select(e => (string?)e.Attribute("NAME") ?? e.Element("NAME")?.Value)
                    .Where(n => !string.IsNullOrWhiteSpace(n))
                    .Select(n => n!.Trim())
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToList();

                if (names.Count > 0) return names;
            }
        }
        catch { }

        // Request 2: Fallback List of Companies
        var xml2 = @"<ENVELOPE><HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER><BODY><EXPORTDATA><REQUESTDESC><REPORTNAME>List of Companies</REPORTNAME><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES></REQUESTDESC></EXPORTDATA></BODY></ENVELOPE>";
        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Post, endpoint)
            {
                Content = new StringContent(xml2, Encoding.UTF8, "text/xml")
            };
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(TimeSpan.FromSeconds(4));

            var res = await _http.SendAsync(req, cts.Token);
            if (res.IsSuccessStatusCode)
            {
                var body = await res.Content.ReadAsStringAsync(cts.Token);
                var clean = InvalidXmlChars.Replace(body, "");
                var doc = XDocument.Parse(clean);
                var names = doc.Descendants("COMPANYNAME")
                    .Select(e => e.Value?.Trim())
                    .Where(n => !string.IsNullOrEmpty(n))
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToList();

                if (names.Count > 0) return names!;
            }
        }
        catch { }

        return list;
    }

    private async Task<List<TallyTaxUnitDto>> FetchTaxUnitsForCompanyAsync(string endpoint, string companyName, CancellationToken ct)
    {
        var list = new List<TallyTaxUnitDto>();
        var escapedCompany = System.Security.SecurityElement.Escape(companyName);
        var xml = $@"<ENVELOPE>
    <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Export</TALLYREQUEST>
        <TYPE>Collection</TYPE>
        <ID>GSTTaxUnits</ID>
    </HEADER>
    <BODY>
        <DESC>
            <STATICVARIABLES>
                <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
                <SVCURRENTCOMPANY>{escapedCompany}</SVCURRENTCOMPANY>
            </STATICVARIABLES>
            <TDL>
                <TDLMESSAGE>
                    <COLLECTION NAME=""GSTTaxUnits"">
                        <TYPE>Tax Unit</TYPE>
                        <FETCH>GSTRegNumber</FETCH>
                        <FETCH>GSTRegistrationDetails</FETCH>
                    </COLLECTION>
                </TDLMESSAGE>
            </TDL>
        </DESC>
    </BODY>
</ENVELOPE>";

        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Post, endpoint)
            {
                Content = new StringContent(xml, Encoding.UTF8, "text/xml")
            };
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(TimeSpan.FromSeconds(4));

            var res = await _http.SendAsync(req, cts.Token);
            if (res.IsSuccessStatusCode)
            {
                var body = await res.Content.ReadAsStringAsync(cts.Token);
                var clean = InvalidXmlChars.Replace(body, "");
                var doc = XDocument.Parse(clean);
                var taxUnits = doc.Descendants().Where(x => x.Name.LocalName.Equals("TAXUNIT", StringComparison.OrdinalIgnoreCase));

                foreach (var tu in taxUnits)
                {
                    var taxType = tu.Attribute("TAXTYPE")?.Value
                                  ?? tu.Attributes().FirstOrDefault(a => a.Name.LocalName.Equals("TAXTYPE", StringComparison.OrdinalIgnoreCase))?.Value
                                  ?? tu.Elements().FirstOrDefault(e => e.Name.LocalName.Equals("TAXTYPE", StringComparison.OrdinalIgnoreCase))?.Value;

                    if (!string.IsNullOrEmpty(taxType) && !taxType.Equals("GST", StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }

                    var gstin = tu.Attribute("TAXREGISTRATION")?.Value
                                ?? tu.Descendants().FirstOrDefault(e => e.Name.LocalName.Equals("GSTREGNUMBER", StringComparison.OrdinalIgnoreCase))?.Value
                                ?? tu.Descendants().FirstOrDefault(e => e.Name.LocalName.Equals("GSTIN", StringComparison.OrdinalIgnoreCase))?.Value;

                    var state = tu.Descendants().FirstOrDefault(e => e.Name.LocalName.Equals("STATE", StringComparison.OrdinalIgnoreCase))?.Value
                                ?? tu.Descendants().FirstOrDefault(e => e.Name.LocalName.Equals("STATENAME", StringComparison.OrdinalIgnoreCase))?.Value;

                    if (!string.IsNullOrWhiteSpace(gstin))
                    {
                        list.Add(new TallyTaxUnitDto
                        {
                            TaxType = "GST",
                            Gstin = gstin.Trim(),
                            State = state?.Trim()
                        });
                    }
                }
            }
        }
        catch { }

        return list;
    }

    private static string CleanHost(string? host)
    {
        if (string.IsNullOrWhiteSpace(host)) return "127.0.0.1";
        var h = host.Trim();
        if (h.StartsWith("http://", StringComparison.OrdinalIgnoreCase)) h = h[7..];
        if (h.StartsWith("https://", StringComparison.OrdinalIgnoreCase)) h = h[8..];
        var slashIdx = h.IndexOf('/');
        if (slashIdx >= 0) h = h[..slashIdx];
        var colonIdx = h.IndexOf(':');
        if (colonIdx >= 0) h = h[..colonIdx];
        return string.IsNullOrWhiteSpace(h) ? "127.0.0.1" : h;
    }

    private static bool IsBlockedSsrf(string host)
    {
        if (host.StartsWith("169.254.", StringComparison.OrdinalIgnoreCase) ||
            host.Equals("metadata.google.internal", StringComparison.OrdinalIgnoreCase) ||
            host.Equals("100.100.100.200", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }
        return false;
    }

    private static async Task<(bool Success, string? Error)> PingHostAsync(string host, int timeoutMs = 2000)
    {
        try
        {
            using var ping = new Ping();
            var reply = await ping.SendPingAsync(host, timeoutMs);
            if (reply.Status == IPStatus.Success)
            {
                return (true, null);
            }
            return (false, $"Ping status: {reply.Status}");
        }
        catch (Exception ex)
        {
            return (false, ex.Message);
        }
    }

    private enum TcpCheckStatus
    {
        Connected,
        ConnectionRefused,
        Unreachable
    }

    private static async Task<TcpCheckStatus> CheckTcpPortAsync(string host, int port, int timeoutMs, CancellationToken ct)
    {
        try
        {
            using var tcp = new TcpClient();
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(timeoutMs);

            var connectTask = tcp.ConnectAsync(host, port);
            var completedTask = await Task.WhenAny(connectTask, Task.Delay(timeoutMs, cts.Token));

            if (completedTask == connectTask && tcp.Connected)
            {
                return TcpCheckStatus.Connected;
            }
            return TcpCheckStatus.Unreachable;
        }
        catch (SocketException sockEx)
        {
            if (sockEx.SocketErrorCode == SocketError.ConnectionRefused)
            {
                return TcpCheckStatus.ConnectionRefused;
            }
            return TcpCheckStatus.Unreachable;
        }
        catch
        {
            return TcpCheckStatus.Unreachable;
        }
    }
}

