using System.Text.RegularExpressions;
using System.Xml;
using System.Xml.Linq;

namespace TallyBridge.Connector.Xml;

public sealed record ImportOutcome(bool Parsed, int Created, int Altered, int Errors, int Exceptions, string? LineError);

public static class TallyResponse
{
    // Tally can emit numeric references to control characters (e.g. &#4;) that are illegal in XML.
    static readonly Regex BadRefs = new(@"&#(?:[0-8]|1[12]|1[4-9]|2\d|3[01]);", RegexOptions.Compiled);

    public static XDocument Load(string xml) => XDocument.Parse(BadRefs.Replace(xml, ""));

    public static ImportOutcome ParseImport(string xml)
    {
        try
        {
            var d = Load(xml);
            int N(string n) => int.TryParse(d.Descendants(n).FirstOrDefault()?.Value, out var x) ? x : 0;
            var le = string.Join("; ", d.Descendants("LINEERROR").Select(e => e.Value.Trim()));
            return new(true, N("CREATED"), N("ALTERED"), N("ERRORS"), N("EXCEPTIONS"), le.Length > 0 ? le : null);
        }
        catch (XmlException) { return new(false, 0, 0, 0, 0, null); }
    }
}
