using System.Text;
namespace TallyBridge.Connector.Xml;
public static class XmlText
{
    /// <summary>Strips characters illegal in XML 1.0 (XDocument escapes &amp; &lt; quotes itself).</summary>
    public static string Clean(string s)
    {
        var sb = new StringBuilder(s.Length);
        foreach (var c in s)
            if (c is '\t' or '\n' or '\r' || (c >= ' ' && c <= '\uD7FF') || (c >= '\uE000' && c <= '\uFFFD') || char.IsSurrogate(c)) sb.Append(c);
        return sb.ToString().Trim();
    }
}
