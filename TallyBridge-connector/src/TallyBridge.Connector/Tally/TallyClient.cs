using System.Net.Sockets;
using System.Text;
using System.Xml.Linq;
using TallyBridge.Connector.Xml;

namespace TallyBridge.Connector.Tally;

/// <summary>Nothing reached Tally (not running / port closed). Safe to report as Failed.</summary>
public sealed class TallyUnreachableException(string m) : Exception(m);
/// <summary>Request may have reached Tally but the outcome is unknown.</summary>
public sealed class TallyUncertainException(string m) : Exception(m);

public sealed class TallyClient(HttpClient http)
{
    // Tally processes one request at a time; serialise to avoid interleaved imports.
    readonly SemaphoreSlim _gate = new(1, 1);

    public async Task<string> PostAsync(XDocument doc, CancellationToken ct)
    {
        await _gate.WaitAsync(ct);
        try
        {
            using var content = new StringContent(doc.ToString(SaveOptions.DisableFormatting), Encoding.UTF8, "text/xml");
            using var resp = await http.PostAsync("/", content, ct);   // status code is NOT trusted; body is parsed by caller
            return await resp.Content.ReadAsStringAsync(ct);
        }
        catch (HttpRequestException ex) when (ex.InnerException is SocketException
            { SocketErrorCode: SocketError.ConnectionRefused or SocketError.HostNotFound or SocketError.NetworkUnreachable })
        { throw new TallyUnreachableException("TallyPrime is not reachable on localhost. Open TallyPrime and enable its HTTP server."); }
        catch (Exception ex) when ((ex is HttpRequestException or TaskCanceledException) && !ct.IsCancellationRequested)
        { throw new TallyUncertainException("Tally did not answer in time."); }
        finally { _gate.Release(); }
    }

    static XDocument Export(string id, string type, string fetch, string? company = null, DateOnly? day = null)
    {
        var vars = new XElement("STATICVARIABLES", new XElement("SVEXPORTFORMAT", "$$SysName:XML"));
        if (company != null) vars.Add(new XElement("SVCURRENTCOMPANY", XmlText.Clean(company)));
        if (day is { } d) vars.Add(new XElement("SVFROMDATE", d.ToString("yyyyMMdd")), new XElement("SVTODATE", d.ToString("yyyyMMdd")));
        return new XDocument(new XElement("ENVELOPE",
            new XElement("HEADER", new XElement("VERSION", 1), new XElement("TALLYREQUEST", "Export"), new XElement("TYPE", "Collection"), new XElement("ID", id)),
            new XElement("BODY", new XElement("DESC", vars,
                new XElement("TDL", new XElement("TDLMESSAGE",
                    new XElement("COLLECTION", new XAttribute("NAME", id), new XAttribute("ISMODIFY", "No"),
                        new XElement("TYPE", type), new XElement("FETCH", fetch))))))));
    }

    static string? NameOf(XElement e) => (string?)e.Attribute("NAME") ?? e.Element("NAME")?.Value;

    public async Task<List<string>> GetCompaniesAsync(CancellationToken ct)
    {
        var x = TallyResponse.Load(await PostAsync(Export("CompanyList", "Company", "NAME"), ct));
        return x.Descendants("COMPANY").Select(NameOf).Where(n => !string.IsNullOrWhiteSpace(n)).Select(n => n!).Distinct().ToList();
    }

    public async Task<HashSet<string>> GetLedgersAsync(string company, CancellationToken ct)
    {
        var x = TallyResponse.Load(await PostAsync(Export("LedgerList", "Ledger", "NAME, PARENT", company), ct));
        return x.Descendants("LEDGER").Select(NameOf).Where(n => n != null).Select(n => n!).ToHashSet(StringComparer.OrdinalIgnoreCase);
    }

    /// <summary>Matches in C# (not in TDL) so invoice text can never inject into a TDL formula.</summary>
    public async Task<bool> VoucherExistsAsync(string company, string type, string number, DateOnly day, string party, CancellationToken ct)
    {
        var x = TallyResponse.Load(await PostAsync(Export("VchList", "Voucher", "VOUCHERNUMBER, VOUCHERTYPENAME, PARTYLEDGERNAME, REFERENCE", company, day), ct));
        bool Eq(string? a, string b) => string.Equals(a?.Trim(), b.Trim(), StringComparison.OrdinalIgnoreCase);
        return x.Descendants("VOUCHER").Any(v =>
            Eq(v.Element("VOUCHERTYPENAME")?.Value, type) && Eq(v.Element("PARTYLEDGERNAME")?.Value, party) &&
            (Eq(v.Element("VOUCHERNUMBER")?.Value, number) || Eq(v.Element("REFERENCE")?.Value, number)));
    }
}
