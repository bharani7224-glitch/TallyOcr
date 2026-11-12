using System.Globalization;
using System.Net;
using System.Security;
using System.Text;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using TallyBridge.Contracts;
using TallyBridge.Server.Models;
using TallyBridge.Server.Services;

namespace TallyBridge.Server.Controllers;

[ApiController]
[AllowAnonymous]
[Route("api/tally")]
public sealed class TallyController : ControllerBase
{
    private readonly IVoucherDispatcher _dispatcher;
    private readonly IConnectorRegistry _registry;
    private readonly ITallyDiagnosticService _diagnostic;
    private readonly IMemoryCache _cache;
    private readonly HttpClient _http;
    private readonly ILogger<TallyController> _logger;

    public TallyController(
        IVoucherDispatcher dispatcher,
        IConnectorRegistry registry,
        ITallyDiagnosticService diagnostic,
        IMemoryCache cache,
        IHttpClientFactory httpFactory,
        ILogger<TallyController> logger)
    {
        _dispatcher = dispatcher;
        _registry = registry;
        _diagnostic = diagnostic;
        _cache = cache;
        _http = httpFactory.CreateClient("TallyDirect");
        _logger = logger;
    }

    private string ResolveClientHost(string? requestedHost)
    {
        if (!string.IsNullOrWhiteSpace(requestedHost))
        {
            var h = requestedHost.Trim();
            if (h.StartsWith("http://", StringComparison.OrdinalIgnoreCase)) h = h[7..];
            if (h.StartsWith("https://", StringComparison.OrdinalIgnoreCase)) h = h[8..];
            var colon = h.IndexOf(':');
            if (colon > 0) h = h[..colon];
            var slash = h.IndexOf('/');
            if (slash > 0) h = h[..slash];
            if (!string.IsNullOrWhiteSpace(h)) return h;
        }

        // 1. Inspect X-Forwarded-For
        if (Request.Headers.TryGetValue("X-Forwarded-For", out var forwardedFor) && !string.IsNullOrWhiteSpace(forwardedFor))
        {
            var firstIp = forwardedFor.ToString().Split(',')[0].Trim();
            if (!string.IsNullOrWhiteSpace(firstIp)) return firstIp;
        }

        // 2. Inspect X-Real-IP
        if (Request.Headers.TryGetValue("X-Real-IP", out var realIp) && !string.IsNullOrWhiteSpace(realIp))
        {
            var ip = realIp.ToString().Trim();
            if (!string.IsNullOrWhiteSpace(ip)) return ip;
        }

        // 3. Fallback to HttpContext RemoteIpAddress
        var remote = HttpContext.Connection.RemoteIpAddress?.ToString();
        if (remote == "::1" || string.IsNullOrWhiteSpace(remote)) return "127.0.0.1";
        return remote;
    }

    private string ResolveEndpoint(string? host, string? endpoint, int port = 9000)
    {
        if (!string.IsNullOrWhiteSpace(endpoint))
        {
            var ep = endpoint.Trim();
            if (!ep.StartsWith("http://", StringComparison.OrdinalIgnoreCase) && !ep.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
            {
                ep = "http://" + ep;
            }
            return ep.TrimEnd('/');
        }
        var targetHost = ResolveClientHost(host);
        return $"http://{targetHost}:{port}";
    }

    // ==========================================
    // 1. POST /api/tally/connect
    // ==========================================
    [HttpPost("connect")]
    public async Task<IActionResult> Connect(
        [FromBody] TallyConnectRequestDto? body,
        CancellationToken ct = default)
    {
        var targetHost = ResolveClientHost(body?.TallyHost ?? body?.Host);
        var port = body?.Port.GetValueOrDefault(9000) > 0 ? body!.Port!.Value : 9000;
        var companyName = body?.CompanyName;

        var result = await _diagnostic.TestConnectivityAsync(targetHost, port, companyName, ct);

        if (result.Connected)
        {
            return Ok(ApiResponse<TallyConnectionResponseDto>.Ok(result, "Successfully connected to TallyPrime."));
        }

        return Ok(ApiResponse<TallyConnectionResponseDto>.Fail(
            result.ErrorCode ?? "TALLY_NOT_RUNNING",
            result.Message ?? "Failed to connect to TallyPrime.",
            result));
    }

    // ==========================================
    // 2. GET /api/tally/test-connection
    // ==========================================
    [HttpGet("test-connection")]
    public async Task<IActionResult> TestConnection(
        [FromQuery] string? host = null,
        [FromQuery] int port = 9000,
        [FromQuery] string? companyName = null,
        CancellationToken ct = default)
    {
        var targetHost = ResolveClientHost(host);
        var result = await _diagnostic.TestConnectivityAsync(targetHost, port, companyName, ct);

        if (result.Connected)
        {
            return Ok(ApiResponse<TallyConnectionResponseDto>.Ok(result, "Successfully connected to TallyPrime."));
        }

        return Ok(ApiResponse<TallyConnectionResponseDto>.Fail(
            result.ErrorCode ?? "TALLY_NOT_RUNNING",
            result.Message ?? "Failed to connect to TallyPrime.",
            result));
    }

    // ==========================================
    // 3. POST /api/tally/write (create-voucher, import-extracted)
    // ==========================================
    [HttpPost("write")]
    [HttpPost("create-voucher")]
    [HttpPost("import-extracted")]
    public async Task<IActionResult> WriteVoucher(
        [FromBody] TallyInvoiceImportRequestDto request,
        [FromQuery] string? host = null,
        [FromQuery] string? endpoint = null,
        [FromQuery] int port = 9000,
        CancellationToken ct = default)
    {
        if (request?.Invoices == null || request.Invoices.Count == 0)
        {
            return BadRequest(new TallyImportResultDto
            {
                Success = false,
                FailedCount = 1,
                Errors = new List<string> { "Request body contains no invoices to import." },
                Message = "No invoices provided in payload."
            });
        }

        var opt = request.Options ?? new TallyImportOptionsDto();
        var targetHost = ResolveClientHost(request.Host ?? request.TallyHost ?? opt.Host ?? opt.TallyHost ?? host);
        var targetPort = request.Port ?? opt.Port ?? (port > 0 ? port : 9000);
        var targetEndpoint = ResolveEndpoint(targetHost, request.Endpoint ?? endpoint, targetPort);

        var targetCompany = !string.IsNullOrWhiteSpace(opt.CompanyName)
            ? opt.CompanyName.Trim()
            : _registry.GetActiveCompanies().FirstOrDefault() ?? "Primary";

        var aggregateResult = new TallyImportResultDto
        {
            Success = true,
            Company = targetCompany
        };

        foreach (var invWrapper in request.Invoices)
        {
            var invHeader = invWrapper.Invoice ?? new TallyInvoiceHeaderDto();
            var voucherDate = invHeader.GetEffectiveVoucherDate();

            // Educational mode validation
            var (isEduValid, eduErr) = TallyVoucherXmlEngine.ValidateEducationalMode(voucherDate, opt.EducationalMode);
            if (!isEduValid)
            {
                aggregateResult.Success = false;
                aggregateResult.FailedCount++;
                aggregateResult.Errors.Add(eduErr!);
                aggregateResult.Message = eduErr;
                continue;
            }

            // Financial year validation
            var (isFyValid, fyErr) = TallyVoucherXmlEngine.ValidateFinancialYear(voucherDate, opt.FinancialYearStart, opt.FinancialYearEnd);
            if (!isFyValid)
            {
                aggregateResult.Success = false;
                aggregateResult.FailedCount++;
                aggregateResult.Errors.Add(fyErr!);
                aggregateResult.Message = fyErr;
                continue;
            }

            // Two-Step Import Architecture:
            // Step 1: Pre-create / alter missing masters under <REPORTNAME>All Masters</REPORTNAME>
            if (opt.AutoCreateLedgers)
            {
                try
                {
                    var mastersXml = TallyVoucherXmlEngine.BuildTallyMastersXml(invWrapper, opt, targetCompany);
                    using var masterReq = new HttpRequestMessage(HttpMethod.Post, targetEndpoint + "/")
                    {
                        Content = new StringContent(mastersXml, Encoding.UTF8, "text/xml")
                    };
                    using var masterCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
                    masterCts.CancelAfter(TimeSpan.FromSeconds(15));
                    await _http.SendAsync(masterReq, masterCts.Token);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Master pre-creation warning for company {Company}", targetCompany);
                }
            }

            // Step 2: Post the pure voucher transaction under <REPORTNAME>Vouchers</REPORTNAME>
            var vNumber = invHeader.GetEffectiveInvoiceNumber();
            var xml = TallyVoucherXmlEngine.BuildTallyVoucherXml(invWrapper, opt, targetCompany);

            decimal vAmount = invWrapper.Totals?.GrandTotal
                ?? invWrapper.Totals?.TotalAmount
                ?? invWrapper.Items.Sum(i => i.LineTotal ?? (i.TaxableValue ?? 0) + (i.CgstAmount ?? 0) + (i.SgstAmount ?? 0) + (i.IgstAmount ?? 0));

            try
            {
                using var reqMsg = new HttpRequestMessage(HttpMethod.Post, targetEndpoint + "/")
                {
                    Content = new StringContent(xml, Encoding.UTF8, "text/xml")
                };
                using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
                cts.CancelAfter(TimeSpan.FromSeconds(20));

                var res = await _http.SendAsync(reqMsg, cts.Token);
                var rawResponse = await res.Content.ReadAsStringAsync(cts.Token);

                var singleResult = TallyVoucherXmlEngine.ParseImportResponse(
                    rawResponse,
                    vNumber,
                    invHeader.GetEffectiveVoucherDate() ?? DateTime.Now.ToString("dd-MMM-yyyy"),
                    targetCompany,
                    vAmount);

                if (singleResult.Success)
                {
                    aggregateResult.CreatedCount += singleResult.CreatedCount;
                    aggregateResult.AlteredCount += singleResult.AlteredCount;
                    aggregateResult.ImportedVouchersCount += singleResult.ImportedVouchersCount;
                    aggregateResult.VoucherNumber = vNumber;
                    aggregateResult.VoucherDate = singleResult.VoucherDate;
                    aggregateResult.Amount = vAmount;
                    aggregateResult.RawXmlResponse = rawResponse;
                    aggregateResult.Message = singleResult.Message;
                }
                else
                {
                    aggregateResult.Success = false;
                    aggregateResult.FailedCount += singleResult.FailedCount;
                    aggregateResult.Errors.AddRange(singleResult.Errors);
                    aggregateResult.Message = singleResult.Message;
                    aggregateResult.RawXmlResponse = rawResponse;
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to import voucher {VoucherNo} to TallyPrime at {Endpoint}", vNumber, targetEndpoint);
                aggregateResult.Success = false;
                aggregateResult.FailedCount++;
                aggregateResult.Errors.Add($"Communication failure with TallyPrime at {targetEndpoint}: {ex.Message}");
                aggregateResult.Message = ex.Message;
            }
        }

        if (aggregateResult.Success && aggregateResult.ImportedVouchersCount > 0)
        {
            aggregateResult.Message = $"Successfully imported {aggregateResult.ImportedVouchersCount} voucher(s) into Tally Prime ({targetCompany}).";
            return Ok(aggregateResult);
        }

        return Ok(aggregateResult);
    }

    // ==========================================
    // 4. GET /api/tally/ledger-groups
    // ==========================================
    [HttpGet("ledger-groups")]
    public async Task<IActionResult> GetLedgerGroups(
        [FromQuery] string? companyName = null,
        [FromQuery] string? format = null,
        [FromQuery] bool forceRefresh = false,
        [FromQuery] string? host = null,
        [FromQuery] string? endpoint = null,
        [FromQuery] int port = 9000,
        CancellationToken ct = default)
    {
        if (string.Equals(format, "hierarchy", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(format, "tree", StringComparison.OrdinalIgnoreCase))
        {
            return await GetHierarchy(companyName, host ?? "127.0.0.1", port, forceRefresh, ct);
        }

        var allLedgers = await FetchAllLedgersInternalAsync(companyName, host, endpoint, port, forceRefresh, ct);
        var groups = allLedgers
            .Select(l => l.ParentGroup)
            .Where(g => !string.IsNullOrWhiteSpace(g))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(g => g)
            .ToList();

        return Ok(ApiResponse<List<string>>.Ok(groups));
    }

    // ==========================================
    // 5. GET /api/tally/ledger-hierarchy
    // ==========================================
    [HttpGet("ledger-hierarchy")]
    [HttpGet("groups-hierarchy")]
    [HttpGet("ledger-groups/hierarchy")]
    public async Task<IActionResult> GetHierarchy(
        [FromQuery] string? companyName = null,
        [FromQuery] string host = "127.0.0.1",
        [FromQuery] int port = 9000,
        [FromQuery] bool forceRefresh = false,
        CancellationToken ct = default)
    {
        var targetHost = ResolveClientHost(host);
        var targetCompany = !string.IsNullOrWhiteSpace(companyName)
            ? companyName.Trim()
            : _registry.GetActiveCompanies().FirstOrDefault() ?? "";

        var cacheKey = $"TallyHierarchy_{targetCompany}_{targetHost}_{port}";
        if (!forceRefresh && _cache.TryGetValue(cacheKey, out TallyHierarchyResponseDto? cachedDto) && cachedDto != null)
        {
            return Ok(cachedDto);
        }

        var allLedgers = await FetchAllLedgersInternalAsync(targetCompany, targetHost, null, port, forceRefresh, ct);
        var parentGroups = allLedgers
            .GroupBy(l => string.IsNullOrWhiteSpace(l.ParentGroup) ? "Primary" : l.ParentGroup, StringComparer.OrdinalIgnoreCase)
            .Select(g => new TallyHierarchyParentDto
            {
                Name = g.Key,
                Child = g.Select(c => new TallyHierarchyGroupItemDto { Name = c.Name }).ToList()
            })
            .ToList();

        var response = new TallyHierarchyResponseDto
        {
            Groups = new List<TallyHierarchyGroupDto>
            {
                new() { Parent = parentGroups }
            }
        };

        _cache.Set(cacheKey, response, TimeSpan.FromSeconds(60));
        return Ok(response);
    }

    // ==========================================
    // 6. GET /api/tally/ledgers/all
    // ==========================================
    [HttpGet("ledgers/all")]
    public async Task<IActionResult> GetAllLedgers(
        [FromQuery] string? companyName = null,
        [FromQuery] bool forceRefresh = false,
        [FromQuery] string? host = null,
        [FromQuery] string? endpoint = null,
        [FromQuery] int port = 9000,
        CancellationToken ct = default)
    {
        var ledgers = await FetchAllLedgersInternalAsync(companyName, host, endpoint, port, forceRefresh, ct);
        return Ok(ApiResponse<List<TallyLedger>>.Ok(ledgers));
    }

    // ==========================================
    // 7. GET /api/tally/voucher-types
    // ==========================================
    [HttpGet("voucher-types")]
    public async Task<IActionResult> GetVoucherTypes(
        [FromQuery] string? companyName = null,
        [FromQuery] bool forceRefresh = false,
        [FromQuery] string? host = null,
        [FromQuery] string? endpoint = null,
        [FromQuery] int port = 9000,
        CancellationToken ct = default)
    {
        var targetHost = ResolveClientHost(host);
        var targetEndpoint = ResolveEndpoint(targetHost, endpoint, port);
        var targetCompany = !string.IsNullOrWhiteSpace(companyName)
            ? companyName.Trim()
            : _registry.GetActiveCompanies().FirstOrDefault() ?? "";

        var cacheKey = $"TallyVoucherTypes_{targetCompany}_{targetEndpoint}";
        if (!forceRefresh && _cache.TryGetValue(cacheKey, out List<TallyVoucherTypeDto>? cached) && cached != null)
        {
            return Ok(ApiResponse<List<TallyVoucherTypeDto>>.Ok(cached));
        }

        var types = await FetchVoucherTypesInternalAsync(targetCompany, targetEndpoint, ct);
        _cache.Set(cacheKey, types, TimeSpan.FromSeconds(60));
        return Ok(ApiResponse<List<TallyVoucherTypeDto>>.Ok(types));
    }

    // ==========================================
    // 8. GET /api/tally/tax-ledgers
    // ==========================================
    [HttpGet("tax-ledgers")]
    public async Task<IActionResult> GetTaxLedgers(
        [FromQuery] string? companyName = null,
        [FromQuery] bool forceRefresh = false,
        [FromQuery] string? host = null,
        [FromQuery] string? endpoint = null,
        [FromQuery] int port = 9000,
        CancellationToken ct = default)
    {
        var allLedgers = await FetchAllLedgersInternalAsync(companyName, host, endpoint, port, forceRefresh, ct);

        var dutiesAndTaxes = allLedgers
            .Where(l => l.ParentGroup.Contains("Duties", StringComparison.OrdinalIgnoreCase) ||
                        l.ParentGroup.Contains("Tax", StringComparison.OrdinalIgnoreCase) ||
                        !string.IsNullOrEmpty(l.TaxType) ||
                        !string.IsNullOrEmpty(l.GstDutyHead))
            .ToList();

        var res = new TallyTaxLedgersResponseDto();

        foreach (var l in dutiesAndTaxes)
        {
            var head = (l.GstDutyHead ?? "").ToUpperInvariant();
            var name = l.Name;
            if (head.Contains("CGST") || Regex.IsMatch(name, @"\bcgst\b", RegexOptions.IgnoreCase))
            {
                if (!res.CgstLedgers.Contains(name, StringComparer.OrdinalIgnoreCase)) res.CgstLedgers.Add(name);
            }
            else if (head.Contains("SGST") || head.Contains("UTGST") || Regex.IsMatch(name, @"\bsgst\b|\butgst\b", RegexOptions.IgnoreCase))
            {
                if (!res.SgstLedgers.Contains(name, StringComparer.OrdinalIgnoreCase)) res.SgstLedgers.Add(name);
            }
            else if (head.Contains("IGST") || Regex.IsMatch(name, @"\bigst\b", RegexOptions.IgnoreCase))
            {
                if (!res.IgstLedgers.Contains(name, StringComparer.OrdinalIgnoreCase)) res.IgstLedgers.Add(name);
            }
            else
            {
                if (!res.OtherTaxLedgers.Contains(name, StringComparer.OrdinalIgnoreCase)) res.OtherTaxLedgers.Add(name);
            }
        }

        // Add defaults if empty
        if (res.CgstLedgers.Count == 0) res.CgstLedgers.AddRange(new[] { "Input CGST", "CGST" });
        if (res.SgstLedgers.Count == 0) res.SgstLedgers.AddRange(new[] { "Input SGST", "SGST" });
        if (res.IgstLedgers.Count == 0) res.IgstLedgers.AddRange(new[] { "Input IGST", "IGST" });

        return Ok(ApiResponse<TallyTaxLedgersResponseDto>.Ok(res));
    }

    // ==========================================
    // 9. GET /api/tally/ledgers
    // ==========================================
    [HttpGet("ledgers")]
    public async Task<IActionResult> GetLedgers(
        [FromQuery] string? companyName = null,
        [FromQuery] string? group = null,
        [FromQuery] bool forceRefresh = false,
        [FromQuery] string? host = null,
        [FromQuery] string? endpoint = null,
        [FromQuery] int port = 9000,
        CancellationToken ct = default)
    {
        var allLedgers = await FetchAllLedgersInternalAsync(companyName, host, endpoint, port, forceRefresh, ct);

        if (!string.IsNullOrWhiteSpace(group))
        {
            var filtered = allLedgers
                .Where(l => string.Equals(l.ParentGroup, group.Trim(), StringComparison.OrdinalIgnoreCase))
                .ToList();
            return Ok(ApiResponse<List<TallyLedger>>.Ok(filtered));
        }

        var names = allLedgers.Select(l => l.Name).Distinct(StringComparer.OrdinalIgnoreCase).OrderBy(n => n).ToList();
        return Ok(ApiResponse<List<string>>.Ok(names));
    }

    // ==========================================
    // 10. GET /api/tally/ledger-groups/with-ledgers
    // ==========================================
    [HttpGet("ledger-groups/with-ledgers")]
    public async Task<IActionResult> GetLedgerGroupsWithLedgers(
        [FromQuery] string? companyName = null,
        [FromQuery] bool forceRefresh = false,
        [FromQuery] string? host = null,
        [FromQuery] string? endpoint = null,
        [FromQuery] int port = 9000,
        CancellationToken ct = default)
    {
        var allLedgers = await FetchAllLedgersInternalAsync(companyName, host, endpoint, port, forceRefresh, ct);

        var groups = allLedgers
            .GroupBy(l => string.IsNullOrWhiteSpace(l.ParentGroup) ? "Primary" : l.ParentGroup, StringComparer.OrdinalIgnoreCase)
            .Select(g => new TallyLedgerGroup
            {
                Name = g.Key,
                Ledgers = g.ToList()
            })
            .OrderBy(g => g.Name)
            .ToList();

        return Ok(ApiResponse<List<TallyLedgerGroup>>.Ok(groups));
    }

    // ==========================================
    // 11. GET /api/tally/companies
    // ==========================================
    [HttpGet("companies")]
    public async Task<IActionResult> GetCompanies(
        [FromQuery] string? format = null,
        [FromQuery] string? host = null,
        [FromQuery] string? endpoint = null,
        [FromQuery] int port = 9000,
        CancellationToken ct = default)
    {
        var targetHost = ResolveClientHost(host);
        var targetEndpoint = ResolveEndpoint(targetHost, endpoint, port);

        var result = await _diagnostic.TestConnectivityAsync(targetHost, port, null, ct);

        if (string.Equals(format, "list", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(format, "details", StringComparison.OrdinalIgnoreCase))
        {
            return Ok(ApiResponse<List<TallyCompanyDto>>.Ok(result.AvailableCompanies));
        }

        var names = result.AvailableCompanies.Select(c => c.CompanyName).ToList();
        if (names.Count == 0 && _registry.GetActiveCompanies().Count > 0)
        {
            names = _registry.GetActiveCompanies();
        }

        var res = new
        {
            success = result.Connected,
            connected = result.Connected,
            companies = names,
            activeCompany = result.CompanyName ?? names.FirstOrDefault() ?? "",
            connectorName = "TallyPrime Integration Module"
        };

        return Ok(res);
    }

    // ==========================================
    // HELPER: Fetch All Ledgers (with 60s cache)
    // ==========================================
    private async Task<List<TallyLedger>> FetchAllLedgersInternalAsync(
        string? companyName,
        string? host,
        string? endpoint,
        int port,
        bool forceRefresh,
        CancellationToken ct)
    {
        var targetHost = ResolveClientHost(host);
        var targetEndpoint = ResolveEndpoint(targetHost, endpoint, port);
        var targetCompany = !string.IsNullOrWhiteSpace(companyName)
            ? companyName.Trim()
            : _registry.GetActiveCompanies().FirstOrDefault() ?? "";

        var cacheKey = $"TallyLedgers_{targetCompany}_{targetEndpoint}";
        if (!forceRefresh && _cache.TryGetValue(cacheKey, out List<TallyLedger>? cached) && cached != null)
        {
            return cached;
        }

        var xml = $@"<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>EXPORT</TALLYREQUEST>
    <TYPE>COLLECTION</TYPE>
    <ID>LedgerCollectionWithParent</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        {(!string.IsNullOrWhiteSpace(targetCompany) ? $"<SVCURRENTCOMPANY>{SecurityElement.Escape(targetCompany)}</SVCURRENTCOMPANY>" : "")}
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME=""LedgerCollectionWithParent"" ISMODIFY=""No"">
            <TYPE>Ledger</TYPE>
            <FETCH>Name, Parent, TaxType, GstDutyHead, RateOfTaxCalculation, PartyGstin, StateName</FETCH>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>";

        var list = new List<TallyLedger>();

        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Post, targetEndpoint + "/")
            {
                Content = new StringContent(xml, Encoding.UTF8, "text/xml")
            };
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(TimeSpan.FromSeconds(6));

            var res = await _http.SendAsync(req, cts.Token);
            if (res.IsSuccessStatusCode)
            {
                var body = await res.Content.ReadAsStringAsync(cts.Token);
                var clean = TallyVoucherXmlEngine.SanitizeXml(body);
                var doc = XDocument.Parse(clean);

                foreach (var el in doc.Descendants("LEDGER"))
                {
                    var name = WebUtility.HtmlDecode((string?)el.Attribute("NAME") ?? el.Element("NAME")?.Value)?.Trim();
                    if (string.IsNullOrEmpty(name)) continue;

                    var parent = WebUtility.HtmlDecode(el.Element("PARENT")?.Value ?? "Primary")?.Trim() ?? "Primary";
                    var taxType = WebUtility.HtmlDecode(el.Element("TAXTYPE")?.Value)?.Trim();
                    var gstHead = WebUtility.HtmlDecode(el.Element("GSTDUTYHEAD")?.Value)?.Trim();
                    var rateStr = el.Element("RATEOFTAXCALCULATION")?.Value;
                    decimal? taxRate = decimal.TryParse(rateStr, NumberStyles.Any, CultureInfo.InvariantCulture, out var r) ? r : null;
                    var gstin = WebUtility.HtmlDecode(el.Element("PARTYGSTIN")?.Value)?.Trim();
                    var state = WebUtility.HtmlDecode(el.Element("STATENAME")?.Value)?.Trim();

                    list.Add(new TallyLedger
                    {
                        Name = name,
                        ParentGroup = parent,
                        TaxType = taxType,
                        GstDutyHead = gstHead,
                        TaxRate = taxRate,
                        PartyGstin = gstin,
                        StateName = state
                    });
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to fetch ledgers from TallyPrime at {Endpoint}", targetEndpoint);
        }

        // Deduplicate case-insensitively
        var deduplicated = list
            .GroupBy(l => l.Name, StringComparer.OrdinalIgnoreCase)
            .Select(g => g.First())
            .OrderBy(l => l.Name)
            .ToList();

        if (deduplicated.Count > 0)
        {
            _cache.Set(cacheKey, deduplicated, TimeSpan.FromSeconds(60));
        }

        return deduplicated;
    }

    // ==========================================
    // HELPER: Fetch Voucher Types
    // ==========================================
    private async Task<List<TallyVoucherTypeDto>> FetchVoucherTypesInternalAsync(
        string targetCompany,
        string targetEndpoint,
        CancellationToken ct)
    {
        var xml = $@"<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>EXPORT</TALLYREQUEST>
    <TYPE>COLLECTION</TYPE>
    <ID>VoucherTypeCollection</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        {(!string.IsNullOrWhiteSpace(targetCompany) ? $"<SVCURRENTCOMPANY>{SecurityElement.Escape(targetCompany)}</SVCURRENTCOMPANY>" : "")}
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME=""VoucherTypeCollection"" ISMODIFY=""No"">
            <TYPE>VoucherType</TYPE>
            <FETCH>Name, Parent, CoreType, NumberingMethod, IsActive</FETCH>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>";

        var list = new List<TallyVoucherTypeDto>();

        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Post, targetEndpoint + "/")
            {
                Content = new StringContent(xml, Encoding.UTF8, "text/xml")
            };
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(TimeSpan.FromSeconds(6));

            var res = await _http.SendAsync(req, cts.Token);
            if (res.IsSuccessStatusCode)
            {
                var body = await res.Content.ReadAsStringAsync(cts.Token);
                var clean = TallyVoucherXmlEngine.SanitizeXml(body);
                var doc = XDocument.Parse(clean);

                foreach (var el in doc.Descendants("VOUCHERTYPE"))
                {
                    var name = WebUtility.HtmlDecode((string?)el.Attribute("NAME") ?? el.Element("NAME")?.Value)?.Trim();
                    if (string.IsNullOrEmpty(name)) continue;

                    var parent = WebUtility.HtmlDecode(el.Element("PARENT")?.Value)?.Trim();
                    var coreType = WebUtility.HtmlDecode(el.Element("CORETYPE")?.Value)?.Trim();
                    var numbering = WebUtility.HtmlDecode(el.Element("NUMBERINGMETHOD")?.Value)?.Trim();
                    var activeStr = el.Element("ISACTIVE")?.Value?.Trim();
                    var isActive = !string.Equals(activeStr, "No", StringComparison.OrdinalIgnoreCase);

                    list.Add(new TallyVoucherTypeDto
                    {
                        Name = name,
                        Parent = parent,
                        CoreType = coreType,
                        NumberingMethod = numbering,
                        IsActive = isActive
                    });
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to fetch voucher types from TallyPrime at {Endpoint}", targetEndpoint);
        }

        if (list.Count == 0)
        {
            // Default built-in types
            list.AddRange(new[]
            {
                new TallyVoucherTypeDto { Name = "Purchase", Parent = "Purchase", CoreType = "Purchase", NumberingMethod = "Automatic", IsActive = true },
                new TallyVoucherTypeDto { Name = "Sales", Parent = "Sales", CoreType = "Sales", NumberingMethod = "Automatic", IsActive = true },
                new TallyVoucherTypeDto { Name = "Payment", Parent = "Payment", CoreType = "Payment", NumberingMethod = "Automatic", IsActive = true },
                new TallyVoucherTypeDto { Name = "Receipt", Parent = "Receipt", CoreType = "Receipt", NumberingMethod = "Automatic", IsActive = true },
                new TallyVoucherTypeDto { Name = "Journal", Parent = "Journal", CoreType = "Journal", NumberingMethod = "Manual", IsActive = true }
            });
        }

        return list;
    }
}
