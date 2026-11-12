using System.Globalization;
using System.Xml.Linq;
using TallyBridge.Contracts;

namespace TallyBridge.Connector.Xml;

public static class VoucherXmlBuilder
{
    public static XDocument Build(VoucherRequest r)
    {
        var d = r.Date.ToString("yyyyMMdd");
        var no = XmlText.Clean(r.VoucherNumber);
        var v = new XElement("VOUCHER",
            new XAttribute("VCHTYPE", r.VoucherType), new XAttribute("ACTION", "Create"), new XAttribute("OBJVIEW", "Accounting Voucher View"),
            new XElement("DATE", d), new XElement("EFFECTIVEDATE", d),
            new XElement("VOUCHERTYPENAME", r.VoucherType),
            new XElement("VOUCHERNUMBER", no), new XElement("REFERENCE", no),
            new XElement("PARTYLEDGERNAME", XmlText.Clean(r.PartyLedger)),
            new XElement("PERSISTEDVIEW", "Accounting Voucher View"),
            new XElement("NARRATION", XmlText.Clean(r.Narration ?? "")));

        foreach (var l in r.Lines.Where(l => l.Amount != 0))
        {
            // Tally: debit = ISDEEMEDPOSITIVE Yes with negative amount; credit = No with positive amount.
            var amt = (l.IsDebit ? -l.Amount : l.Amount).ToString("0.00", CultureInfo.InvariantCulture);
            v.Add(new XElement("ALLLEDGERENTRIES.LIST",
                new XElement("LEDGERNAME", XmlText.Clean(l.Ledger)),
                new XElement("ISDEEMEDPOSITIVE", l.IsDebit ? "Yes" : "No"),
                new XElement("ISPARTYLEDGER", string.Equals(l.Ledger, r.PartyLedger, StringComparison.OrdinalIgnoreCase) ? "Yes" : "No"),
                new XElement("AMOUNT", amt)));
        }

        return new XDocument(new XElement("ENVELOPE",
            new XElement("HEADER", new XElement("TALLYREQUEST", "Import Data")),
            new XElement("BODY", new XElement("IMPORTDATA",
                new XElement("REQUESTDESC", new XElement("REPORTNAME", "Vouchers"),
                    new XElement("STATICVARIABLES", new XElement("SVCURRENTCOMPANY", XmlText.Clean(r.Company)))),
                new XElement("REQUESTDATA", new XElement("TALLYMESSAGE", new XAttribute(XNamespace.Xmlns + "UDF", "TallyUDF"), v))))));
    }
}
