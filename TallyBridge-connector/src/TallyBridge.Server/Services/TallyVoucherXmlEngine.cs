using System.Globalization;
using System.Net;
using System.Security;
using System.Text;
using System.Text.RegularExpressions;
using TallyBridge.Server.Models;

namespace TallyBridge.Server.Services;

public static class TallyVoucherXmlEngine
{
    private static readonly Regex InvalidXmlCharsRegex = new(
        @"[\x00-\x08\x0B\x0C\x0E-\x1F]|&#(?:[0-8]|1[12]|1[4-9]|2\d|3[01]);|&#x(?:[0-8]|[bB]|[cC]|[eE]|[fF]|1[0-9a-fA-F]);",
        RegexOptions.Compiled);

    private static readonly Regex UnescapedAmpersandRegex = new(
        @"&(?!(amp|lt|gt|apos|quot|#\d+|#[xX][0-9a-fA-F]+);)",
        RegexOptions.Compiled);

    public static string SanitizeXml(string? rawXml)
    {
        if (string.IsNullOrWhiteSpace(rawXml)) return string.Empty;
        var clean = InvalidXmlCharsRegex.Replace(rawXml, string.Empty);
        return UnescapedAmpersandRegex.Replace(clean, "&amp;");
    }

    public static (bool IsValid, string? Error) ValidateEducationalMode(string? dateStr, bool educationalMode)
    {
        if (!educationalMode || string.IsNullOrWhiteSpace(dateStr)) return (true, null);

        if (DateTime.TryParse(dateStr, CultureInfo.InvariantCulture, DateTimeStyles.None, out var dt) ||
            (dateStr.Length == 8 && DateTime.TryParseExact(dateStr, "yyyyMMdd", CultureInfo.InvariantCulture, DateTimeStyles.None, out dt)))
        {
            var daysInMonth = DateTime.DaysInMonth(dt.Year, dt.Month);
            if (dt.Day != 1 && dt.Day != 2 && dt.Day != daysInMonth)
            {
                return (false, $"Educational Mode only permits dates on the 1st, 2nd, or last day of the month ({daysInMonth}). Found day: {dt.Day}. Disable Educational Mode in configuration to preserve exact dates.");
            }
        }
        return (true, null);
    }

    public static (bool IsValid, string? Error) ValidateFinancialYear(string? dateStr, string? fyStartStr, string? fyEndStr)
    {
        if (string.IsNullOrWhiteSpace(dateStr) || string.IsNullOrWhiteSpace(fyStartStr) || string.IsNullOrWhiteSpace(fyEndStr))
        {
            return (true, null);
        }

        if (DateTime.TryParse(dateStr, CultureInfo.InvariantCulture, DateTimeStyles.None, out var dt) &&
            DateTime.TryParse(fyStartStr, CultureInfo.InvariantCulture, DateTimeStyles.None, out var start) &&
            DateTime.TryParse(fyEndStr, CultureInfo.InvariantCulture, DateTimeStyles.None, out var end))
        {
            if (dt < start || dt > end)
            {
                return (false, $"Voucher date {dt:yyyy-MM-dd} is outside the active financial year ({start:yyyy-MM-dd} to {end:yyyy-MM-dd}).");
            }
        }
        return (true, null);
    }

    public static string FormatDateForTally(string? dateStr)
    {
        if (string.IsNullOrWhiteSpace(dateStr)) return DateTime.Now.ToString("yyyyMMdd");
        var trimmed = dateStr.Trim();
        if (trimmed.Length == 8 && int.TryParse(trimmed, out _)) return trimmed;

        if (DateTime.TryParse(trimmed, CultureInfo.InvariantCulture, DateTimeStyles.None, out var dt) ||
            DateTime.TryParseExact(trimmed, new[] { "yyyy-MM-dd", "dd/MM/yyyy", "dd-MM-yyyy", "yyyy/MM/dd", "dd-MMM-yyyy", "dd-MMM-yy", "yyyyMMdd" }, CultureInfo.InvariantCulture, DateTimeStyles.None, out dt))
        {
            return dt.ToString("yyyyMMdd");
        }

        return DateTime.Now.ToString("yyyyMMdd");
    }

    // ==========================================
    // STEP 1: MASTERS XML (REPORTNAME = All Masters)
    // ==========================================
    public static string BuildTallyMastersXml(
        TallyInvoiceWrapperDto invWrapper,
        TallyImportOptionsDto options,
        string targetCompany)
    {
        var seller = invWrapper.Seller ?? new TallyEntityDto();
        var buyer = invWrapper.Buyer ?? new TallyEntityDto();
        var items = invWrapper.Items;

        var voucherType = !string.IsNullOrWhiteSpace(options.VoucherType) ? options.VoucherType.Trim() : "Purchase";
        var isPurchase = string.Equals(voucherType, "Purchase", StringComparison.OrdinalIgnoreCase);

        var partyName = !string.IsNullOrWhiteSpace(options.PartyLedgerName)
            ? options.PartyLedgerName.Trim()
            : !string.IsNullOrWhiteSpace(invWrapper.PartyName)
                ? invWrapper.PartyName.Trim()
                : isPurchase
                    ? (!string.IsNullOrWhiteSpace(seller.Name) ? seller.Name.Trim() : "Sundry Creditors")
                    : (!string.IsNullOrWhiteSpace(buyer.Name) ? buyer.Name.Trim() : "Sundry Debtors");

        var partyGstin = isPurchase ? seller.Gstin : buyer.Gstin;
        var partyState = isPurchase ? seller.State : buyer.State;
        var partyAddress = isPurchase ? seller.Address : buyer.Address;

        var mainLedger = !string.IsNullOrWhiteSpace(options.MainLedgerName)
            ? options.MainLedgerName.Trim()
            : isPurchase
                ? (!string.IsNullOrWhiteSpace(options.PurchaseLedgerName) ? options.PurchaseLedgerName.Trim() : "Purchase")
                : (!string.IsNullOrWhiteSpace(options.SalesLedgerName) ? options.SalesLedgerName.Trim() : "Sales");

        var cgstLedger = !string.IsNullOrWhiteSpace(options.CgstLedgerName) ? options.CgstLedgerName.Trim() : (isPurchase ? "Input CGST" : "Output CGST");
        var sgstLedger = !string.IsNullOrWhiteSpace(options.SgstLedgerName) ? options.SgstLedgerName.Trim() : (isPurchase ? "Input SGST" : "Output SGST");
        var igstLedger = !string.IsNullOrWhiteSpace(options.IgstLedgerName) ? options.IgstLedgerName.Trim() : (isPurchase ? "Input IGST" : "Output IGST");
        var roundOffLedger = !string.IsNullOrWhiteSpace(options.RoundOffLedgerName) ? options.RoundOffLedgerName.Trim() : "Round Off";

        var sb = new StringBuilder();
        sb.AppendLine("<ENVELOPE>");
        sb.AppendLine("  <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>");
        sb.AppendLine("  <BODY><IMPORTDATA>");
        sb.AppendLine("    <REQUESTDESC><REPORTNAME>All Masters</REPORTNAME>");
        sb.AppendLine($"      <STATICVARIABLES><SVCURRENTCOMPANY>{SecurityElement.Escape(targetCompany)}</SVCURRENTCOMPANY></STATICVARIABLES>");
        sb.AppendLine("    </REQUESTDESC>");
        sb.AppendLine("    <REQUESTDATA>");

        // 1. Unit master
        sb.AppendLine("      <TALLYMESSAGE xmlns:UDF=\"TallyUDF\">");
        sb.AppendLine("        <UNIT NAME=\"Nos\" ACTION=\"Create\"><NAME>Nos</NAME><ISSIMPLEUNIT>Yes</ISSIMPLEUNIT></UNIT>");
        sb.AppendLine("      </TALLYMESSAGE>");

        // 2. Stock items if inventory mode
        if (options.IncludeInventoryItems && items.Count > 0)
        {
            foreach (var itm in items.Where(i => !string.IsNullOrWhiteSpace(i.Description ?? i.ItemName)))
            {
                var itmName = (itm.Description ?? itm.ItemName)!.Trim();
                var uom = !string.IsNullOrWhiteSpace(itm.Unit) ? itm.Unit.Trim() : "Nos";
                sb.AppendLine("      <TALLYMESSAGE xmlns:UDF=\"TallyUDF\">");
                sb.AppendLine($"        <STOCKITEM NAME=\"{SecurityElement.Escape(itmName)}\" ACTION=\"Create\">");
                sb.AppendLine($"          <NAME>{SecurityElement.Escape(itmName)}</NAME>");
                sb.AppendLine($"          <BASEUNITS>{SecurityElement.Escape(uom)}</BASEUNITS>");
                sb.AppendLine("          <OPENINGBALANCE>0</OPENINGBALANCE>");
                sb.AppendLine("        </STOCKITEM>");
                sb.AppendLine("      </TALLYMESSAGE>");
            }
        }

        // 3. Party Ledger
        var partyParent = isPurchase ? "Sundry Creditors" : "Sundry Debtors";
        sb.AppendLine("      <TALLYMESSAGE xmlns:UDF=\"TallyUDF\">");
        sb.AppendLine($"        <LEDGER NAME=\"{SecurityElement.Escape(partyName)}\" ACTION=\"Create\">");
        sb.AppendLine($"          <NAME>{SecurityElement.Escape(partyName)}</NAME>");
        sb.AppendLine($"          <PARENT>{SecurityElement.Escape(partyParent)}</PARENT>");
        sb.AppendLine("          <ISBILLWISEON>Yes</ISBILLWISEON>");
        sb.AppendLine("          <AFFECTSSTOCK>No</AFFECTSSTOCK>");
        if (!string.IsNullOrWhiteSpace(partyGstin))
        {
            sb.AppendLine($"          <PARTYGSTIN>{SecurityElement.Escape(partyGstin.Trim())}</PARTYGSTIN>");
            sb.AppendLine("          <GSTREGISTRATIONTYPE>Regular</GSTREGISTRATIONTYPE>");
        }
        if (!string.IsNullOrWhiteSpace(partyState))
        {
            sb.AppendLine($"          <LEDSTATENAME>{SecurityElement.Escape(partyState.Trim())}</LEDSTATENAME>");
        }
        if (!string.IsNullOrWhiteSpace(partyAddress))
        {
            sb.AppendLine("          <ADDRESS.LIST>");
            sb.AppendLine($"            <ADDRESS>{SecurityElement.Escape(partyAddress.Trim())}</ADDRESS>");
            sb.AppendLine("          </ADDRESS.LIST>");
        }
        sb.AppendLine("        </LEDGER>");
        sb.AppendLine("      </TALLYMESSAGE>");

        // 4. Main Ledger
        var mainParent = isPurchase ? "Purchase Accounts" : "Sales Accounts";
        sb.AppendLine("      <TALLYMESSAGE xmlns:UDF=\"TallyUDF\">");
        sb.AppendLine($"        <LEDGER NAME=\"{SecurityElement.Escape(mainLedger)}\" ACTION=\"Create\">");
        sb.AppendLine($"          <NAME>{SecurityElement.Escape(mainLedger)}</NAME>");
        sb.AppendLine($"          <PARENT>{SecurityElement.Escape(mainParent)}</PARENT>");
        sb.AppendLine($"          <AFFECTSSTOCK>{(options.IncludeInventoryItems ? "Yes" : "No")}</AFFECTSSTOCK>");
        sb.AppendLine("        </LEDGER>");
        sb.AppendLine("      </TALLYMESSAGE>");

        // 5. Tax Ledgers
        sb.AppendLine("      <TALLYMESSAGE xmlns:UDF=\"TallyUDF\">");
        sb.AppendLine($"        <LEDGER NAME=\"{SecurityElement.Escape(cgstLedger)}\" ACTION=\"Create\">");
        sb.AppendLine($"          <NAME>{SecurityElement.Escape(cgstLedger)}</NAME>");
        sb.AppendLine("          <PARENT>Duties &amp; Taxes</PARENT>");
        sb.AppendLine("          <TAXTYPE>GST</TAXTYPE>");
        sb.AppendLine("          <GSTDUTYHEAD>CGST</GSTDUTYHEAD>");
        sb.AppendLine("        </LEDGER>");
        sb.AppendLine("      </TALLYMESSAGE>");

        sb.AppendLine("      <TALLYMESSAGE xmlns:UDF=\"TallyUDF\">");
        sb.AppendLine($"        <LEDGER NAME=\"{SecurityElement.Escape(sgstLedger)}\" ACTION=\"Create\">");
        sb.AppendLine($"          <NAME>{SecurityElement.Escape(sgstLedger)}</NAME>");
        sb.AppendLine("          <PARENT>Duties &amp; Taxes</PARENT>");
        sb.AppendLine("          <TAXTYPE>GST</TAXTYPE>");
        sb.AppendLine("          <GSTDUTYHEAD>SGST/UTGST</GSTDUTYHEAD>");
        sb.AppendLine("        </LEDGER>");
        sb.AppendLine("      </TALLYMESSAGE>");

        sb.AppendLine("      <TALLYMESSAGE xmlns:UDF=\"TallyUDF\">");
        sb.AppendLine($"        <LEDGER NAME=\"{SecurityElement.Escape(igstLedger)}\" ACTION=\"Create\">");
        sb.AppendLine($"          <NAME>{SecurityElement.Escape(igstLedger)}</NAME>");
        sb.AppendLine("          <PARENT>Duties &amp; Taxes</PARENT>");
        sb.AppendLine("          <TAXTYPE>GST</TAXTYPE>");
        sb.AppendLine("          <GSTDUTYHEAD>IGST</GSTDUTYHEAD>");
        sb.AppendLine("        </LEDGER>");
        sb.AppendLine("      </TALLYMESSAGE>");

        // 6. Round Off Ledger
        sb.AppendLine("      <TALLYMESSAGE xmlns:UDF=\"TallyUDF\">");
        sb.AppendLine($"        <LEDGER NAME=\"{SecurityElement.Escape(roundOffLedger)}\" ACTION=\"Create\">");
        sb.AppendLine($"          <NAME>{SecurityElement.Escape(roundOffLedger)}</NAME>");
        sb.AppendLine("          <PARENT>Indirect Expenses</PARENT>");
        sb.AppendLine("        </LEDGER>");
        sb.AppendLine("      </TALLYMESSAGE>");

        sb.AppendLine("    </REQUESTDATA>");
        sb.AppendLine("  </IMPORTDATA></BODY>");
        sb.AppendLine("</ENVELOPE>");

        return sb.ToString();
    }

    // ==========================================
    // STEP 2: VOUCHER XML (REPORTNAME = Vouchers)
    // ==========================================
    public static string BuildTallyVoucherXml(
        TallyInvoiceWrapperDto invWrapper,
        TallyImportOptionsDto options,
        string targetCompany)
    {
        var inv = invWrapper.Invoice ?? new TallyInvoiceHeaderDto();
        var seller = invWrapper.Seller ?? new TallyEntityDto();
        var buyer = invWrapper.Buyer ?? new TallyEntityDto();
        var items = invWrapper.Items;

        var voucherType = !string.IsNullOrWhiteSpace(options.VoucherType) ? options.VoucherType.Trim() : "Purchase";
        var isPurchase = string.Equals(voucherType, "Purchase", StringComparison.OrdinalIgnoreCase);

        var voucherDate = FormatDateForTally(inv.GetEffectiveVoucherDate());
        var invoiceDate = FormatDateForTally(inv.GetEffectiveInvoiceDate() ?? inv.GetEffectiveVoucherDate());
        var invoiceNumber = inv.GetEffectiveInvoiceNumber();

        var partyName = !string.IsNullOrWhiteSpace(options.PartyLedgerName)
            ? options.PartyLedgerName.Trim()
            : !string.IsNullOrWhiteSpace(invWrapper.PartyName)
                ? invWrapper.PartyName.Trim()
                : isPurchase
                    ? (!string.IsNullOrWhiteSpace(seller.Name) ? seller.Name.Trim() : "Sundry Creditors")
                    : (!string.IsNullOrWhiteSpace(buyer.Name) ? buyer.Name.Trim() : "Sundry Debtors");

        var mainLedger = !string.IsNullOrWhiteSpace(options.MainLedgerName)
            ? options.MainLedgerName.Trim()
            : isPurchase
                ? (!string.IsNullOrWhiteSpace(options.PurchaseLedgerName) ? options.PurchaseLedgerName.Trim() : "Purchase")
                : (!string.IsNullOrWhiteSpace(options.SalesLedgerName) ? options.SalesLedgerName.Trim() : "Sales");

        var sellerGstPrefix = (seller.Gstin ?? "").Trim().Length >= 2 ? seller.Gstin!.Trim()[..2] : "";
        var buyerGstPrefix = (buyer.Gstin ?? "").Trim().Length >= 2 ? buyer.Gstin!.Trim()[..2] : "";
        var isInterState = !string.IsNullOrEmpty(sellerGstPrefix) && !string.IsNullOrEmpty(buyerGstPrefix)
            ? !sellerGstPrefix.Equals(buyerGstPrefix, StringComparison.OrdinalIgnoreCase)
            : false;

        decimal subtotal = invWrapper.Totals?.Subtotal
            ?? invWrapper.Totals?.TaxableAmount
            ?? items.Sum(i => i.TaxableValue ?? (i.Quantity ?? 1) * (i.UnitPrice ?? 0));

        decimal cgst = invWrapper.Totals?.CgstTotal ?? items.Sum(i => i.CgstAmount ?? 0);
        decimal sgst = invWrapper.Totals?.SgstTotal ?? items.Sum(i => i.SgstAmount ?? 0);
        decimal igst = invWrapper.Totals?.IgstTotal ?? items.Sum(i => i.IgstAmount ?? 0);
        decimal roundOff = invWrapper.Totals?.RoundOff ?? 0;
        decimal grandTotal = invWrapper.Totals?.GrandTotal
            ?? invWrapper.Totals?.TotalAmount
            ?? (subtotal + cgst + sgst + igst + roundOff);

        // Strict auto-balancing
        var diff = grandTotal - (subtotal + cgst + sgst + igst + roundOff);
        if (Math.Abs(diff) > 0.001m)
        {
            if (cgst == 0 && sgst == 0 && igst == 0 && diff > 0)
            {
                if (isInterState)
                {
                    igst = diff;
                }
                else
                {
                    cgst = Math.Round(diff / 2m, 2);
                    sgst = diff - cgst;
                }
            }
            else if (Math.Abs(diff) <= 5.00m)
            {
                roundOff += diff;
            }
            else
            {
                subtotal += diff;
            }
        }

        var cgstLedger = !string.IsNullOrWhiteSpace(options.CgstLedgerName) ? options.CgstLedgerName.Trim() : (isPurchase ? "Input CGST" : "Output CGST");
        var sgstLedger = !string.IsNullOrWhiteSpace(options.SgstLedgerName) ? options.SgstLedgerName.Trim() : (isPurchase ? "Input SGST" : "Output SGST");
        var igstLedger = !string.IsNullOrWhiteSpace(options.IgstLedgerName) ? options.IgstLedgerName.Trim() : (isPurchase ? "Input IGST" : "Output IGST");
        var roundOffLedger = !string.IsNullOrWhiteSpace(options.RoundOffLedgerName) ? options.RoundOffLedgerName.Trim() : "Round Off";

        var isItemInvoice = options.IncludeInventoryItems && items.Count > 0;
        var isAsVoucher = string.Equals(options.VoucherMode, "As Voucher", StringComparison.OrdinalIgnoreCase) || !options.IsInvoice;

        string objView = isItemInvoice ? "Invoice Voucher View" : "Accounting Voucher View";
        string persistedView = isItemInvoice ? "Invoice Voucher View" : "Accounting Voucher View";
        string isInvoiceTag = isAsVoucher ? "No" : "Yes";
        string isAccountingTag = (!isItemInvoice && !isAsVoucher) ? "Yes" : "No";

        var sb = new StringBuilder();
        sb.AppendLine("<ENVELOPE>");
        sb.AppendLine("  <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>");
        sb.AppendLine("  <BODY><IMPORTDATA>");
        sb.AppendLine("    <REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME>");
        sb.AppendLine($"      <STATICVARIABLES><SVCURRENTCOMPANY>{SecurityElement.Escape(targetCompany)}</SVCURRENTCOMPANY></STATICVARIABLES>");
        sb.AppendLine("    </REQUESTDESC>");
        sb.AppendLine("    <REQUESTDATA>");
        sb.AppendLine("      <TALLYMESSAGE xmlns:UDF=\"TallyUDF\">");
        sb.AppendLine($"        <VOUCHER VCHTYPE=\"{SecurityElement.Escape(voucherType)}\" ACTION=\"Create\" OBJVIEW=\"{objView}\">");
        sb.AppendLine($"          <DATE>{voucherDate}</DATE>");
        sb.AppendLine($"          <EFFECTIVEDATE>{voucherDate}</EFFECTIVEDATE>");
        sb.AppendLine($"          <VOUCHERTYPENAME>{SecurityElement.Escape(voucherType)}</VOUCHERTYPENAME>");
        sb.AppendLine($"          <VOUCHERNUMBER>{SecurityElement.Escape(invoiceNumber)}</VOUCHERNUMBER>");
        sb.AppendLine($"          <REFERENCE>{SecurityElement.Escape(invoiceNumber)}</REFERENCE>");
        sb.AppendLine($"          <REFERENCEDATE>{invoiceDate}</REFERENCEDATE>");
        sb.AppendLine($"          <PARTYLEDGERNAME>{SecurityElement.Escape(partyName)}</PARTYLEDGERNAME>");
        sb.AppendLine($"          <PERSISTEDVIEW>{persistedView}</PERSISTEDVIEW>");
        sb.AppendLine($"          <ISINVOICE>{isInvoiceTag}</ISINVOICE>");
        if (!isAsVoucher)
        {
            sb.AppendLine($"          <ISACCOUNTINGVOUCHER>{isAccountingTag}</ISACCOUNTINGVOUCHER>");
        }
        var effectiveNarration = !string.IsNullOrWhiteSpace(options.Narration)
            ? options.Narration.Trim()
            : !string.IsNullOrWhiteSpace(inv.Narration)
                ? inv.Narration.Trim()
                : string.Empty;

        if (!string.IsNullOrWhiteSpace(effectiveNarration))
        {
            sb.AppendLine($"          <NARRATION>{SecurityElement.Escape(effectiveNarration)}</NARRATION>");
        }
        else
        {
            sb.AppendLine("          <NARRATION></NARRATION>");
        }

        // Party Entry (Credit for Purchase: +, Debit for Sales: -)
        var partyIsDebit = !isPurchase;
        var partyAmt = (partyIsDebit ? -grandTotal : grandTotal).ToString("0.00", CultureInfo.InvariantCulture);

        sb.AppendLine("          <ALLLEDGERENTRIES.LIST>");
        sb.AppendLine($"            <LEDGERNAME>{SecurityElement.Escape(partyName)}</LEDGERNAME>");
        sb.AppendLine($"            <ISDEEMEDPOSITIVE>{(partyIsDebit ? "Yes" : "No")}</ISDEEMEDPOSITIVE>");
        sb.AppendLine("            <ISPARTYLEDGER>Yes</ISPARTYLEDGER>");
        sb.AppendLine($"            <AMOUNT>{partyAmt}</AMOUNT>");
        sb.AppendLine("            <BILLALLOCATIONS.LIST>");
        sb.AppendLine($"              <NAME>{SecurityElement.Escape(invoiceNumber)}</NAME>");
        sb.AppendLine("              <BILLTYPE>New Ref</BILLTYPE>");
        sb.AppendLine($"              <AMOUNT>{partyAmt}</AMOUNT>");
        sb.AppendLine("            </BILLALLOCATIONS.LIST>");
        sb.AppendLine("          </ALLLEDGERENTRIES.LIST>");

        if (isItemInvoice)
        {
            foreach (var itm in items.Where(i => !string.IsNullOrWhiteSpace(i.Description ?? i.ItemName)))
            {
                var itmName = (itm.Description ?? itm.ItemName)!.Trim();
                var qty = itm.Quantity ?? 1m;
                var rate = itm.UnitPrice ?? (itm.TaxableValue.HasValue ? itm.TaxableValue.Value / qty : 0m);
                var itmAmt = itm.TaxableValue ?? (qty * rate);
                var uom = !string.IsNullOrWhiteSpace(itm.Unit) ? itm.Unit.Trim() : "Nos";

                var itmIsDebit = isPurchase;
                var itmSignedAmt = (itmIsDebit ? -itmAmt : itmAmt).ToString("0.00", CultureInfo.InvariantCulture);

                sb.AppendLine("          <ALLINVENTORYENTRIES.LIST>");
                sb.AppendLine($"            <STOCKITEMNAME>{SecurityElement.Escape(itmName)}</STOCKITEMNAME>");
                sb.AppendLine($"            <ISDEEMEDPOSITIVE>{(itmIsDebit ? "Yes" : "No")}</ISDEEMEDPOSITIVE>");
                sb.AppendLine($"            <RATE>{rate:0.00}/{uom}</RATE>");
                sb.AppendLine($"            <AMOUNT>{itmSignedAmt}</AMOUNT>");
                sb.AppendLine($"            <ACTUALQTY>{qty} {uom}</ACTUALQTY>");
                sb.AppendLine($"            <BILLEDQTY>{qty} {uom}</BILLEDQTY>");
                if (!string.IsNullOrWhiteSpace(itm.HsnSac))
                {
                    sb.AppendLine($"            <HSNCODE>{SecurityElement.Escape(itm.HsnSac.Trim())}</HSNCODE>");
                }
                sb.AppendLine("            <ACCOUNTINGALLOCATIONS.LIST>");
                sb.AppendLine($"              <LEDGERNAME>{SecurityElement.Escape(mainLedger)}</LEDGERNAME>");
                sb.AppendLine($"              <ISDEEMEDPOSITIVE>{(itmIsDebit ? "Yes" : "No")}</ISDEEMEDPOSITIVE>");
                sb.AppendLine($"              <AMOUNT>{itmSignedAmt}</AMOUNT>");
                sb.AppendLine("            </ACCOUNTINGALLOCATIONS.LIST>");
                sb.AppendLine("          </ALLINVENTORYENTRIES.LIST>");
            }
        }
        else
        {
            var mainIsDebit = isPurchase;
            var mainAmt = (mainIsDebit ? -subtotal : subtotal).ToString("0.00", CultureInfo.InvariantCulture);
            sb.AppendLine("          <ALLLEDGERENTRIES.LIST>");
            sb.AppendLine($"            <LEDGERNAME>{SecurityElement.Escape(mainLedger)}</LEDGERNAME>");
            sb.AppendLine($"            <ISDEEMEDPOSITIVE>{(mainIsDebit ? "Yes" : "No")}</ISDEEMEDPOSITIVE>");
            sb.AppendLine("            <ISPARTYLEDGER>No</ISPARTYLEDGER>");
            sb.AppendLine($"            <AMOUNT>{mainAmt}</AMOUNT>");
            sb.AppendLine("          </ALLLEDGERENTRIES.LIST>");
        }

        // Taxes
        var taxIsDebit = isPurchase;
        if (cgst > 0)
        {
            var cgstAmt = (taxIsDebit ? -cgst : cgst).ToString("0.00", CultureInfo.InvariantCulture);
            sb.AppendLine("          <ALLLEDGERENTRIES.LIST>");
            sb.AppendLine($"            <LEDGERNAME>{SecurityElement.Escape(cgstLedger)}</LEDGERNAME>");
            sb.AppendLine($"            <ISDEEMEDPOSITIVE>{(taxIsDebit ? "Yes" : "No")}</ISDEEMEDPOSITIVE>");
            sb.AppendLine("            <ISPARTYLEDGER>No</ISPARTYLEDGER>");
            sb.AppendLine($"            <AMOUNT>{cgstAmt}</AMOUNT>");
            sb.AppendLine("          </ALLLEDGERENTRIES.LIST>");
        }
        if (sgst > 0)
        {
            var sgstAmt = (taxIsDebit ? -sgst : sgst).ToString("0.00", CultureInfo.InvariantCulture);
            sb.AppendLine("          <ALLLEDGERENTRIES.LIST>");
            sb.AppendLine($"            <LEDGERNAME>{SecurityElement.Escape(sgstLedger)}</LEDGERNAME>");
            sb.AppendLine($"            <ISDEEMEDPOSITIVE>{(taxIsDebit ? "Yes" : "No")}</ISDEEMEDPOSITIVE>");
            sb.AppendLine("            <ISPARTYLEDGER>No</ISPARTYLEDGER>");
            sb.AppendLine($"            <AMOUNT>{sgstAmt}</AMOUNT>");
            sb.AppendLine("          </ALLLEDGERENTRIES.LIST>");
        }
        if (igst > 0)
        {
            var igstAmt = (taxIsDebit ? -igst : igst).ToString("0.00", CultureInfo.InvariantCulture);
            sb.AppendLine("          <ALLLEDGERENTRIES.LIST>");
            sb.AppendLine($"            <LEDGERNAME>{SecurityElement.Escape(igstLedger)}</LEDGERNAME>");
            sb.AppendLine($"            <ISDEEMEDPOSITIVE>{(taxIsDebit ? "Yes" : "No")}</ISDEEMEDPOSITIVE>");
            sb.AppendLine("            <ISPARTYLEDGER>No</ISPARTYLEDGER>");
            sb.AppendLine($"            <AMOUNT>{igstAmt}</AMOUNT>");
            sb.AppendLine("          </ALLLEDGERENTRIES.LIST>");
        }

        // Round Off
        if (roundOff != 0)
        {
            bool isDebit = isPurchase ? roundOff > 0 : roundOff < 0;
            var absAmt = Math.Abs(roundOff);
            var signedAmt = (isDebit ? -absAmt : absAmt).ToString("0.00", CultureInfo.InvariantCulture);

            sb.AppendLine("          <ALLLEDGERENTRIES.LIST>");
            sb.AppendLine($"            <LEDGERNAME>{SecurityElement.Escape(roundOffLedger)}</LEDGERNAME>");
            sb.AppendLine($"            <ISDEEMEDPOSITIVE>{(isDebit ? "Yes" : "No")}</ISDEEMEDPOSITIVE>");
            sb.AppendLine("            <ISPARTYLEDGER>No</ISPARTYLEDGER>");
            sb.AppendLine($"            <AMOUNT>{signedAmt}</AMOUNT>");
            sb.AppendLine("          </ALLLEDGERENTRIES.LIST>");
        }

        sb.AppendLine("        </VOUCHER>");
        sb.AppendLine("      </TALLYMESSAGE>");
        sb.AppendLine("    </REQUESTDATA>");
        sb.AppendLine("  </IMPORTDATA></BODY>");
        sb.AppendLine("</ENVELOPE>");

        return sb.ToString();
    }

    public static TallyImportResultDto ParseImportResponse(string rawXml, string voucherNo, string? voucherDate, string company, decimal? amount)
    {
        var result = new TallyImportResultDto
        {
            VoucherNumber = voucherNo,
            VoucherDate = voucherDate,
            Company = company,
            Amount = amount,
            RawXmlResponse = rawXml
        };

        if (string.IsNullOrWhiteSpace(rawXml))
        {
            result.Success = false;
            result.FailedCount = 1;
            result.Errors.Add("Empty response received from TallyPrime.");
            result.Message = "Empty response received from TallyPrime.";
            return result;
        }

        var clean = SanitizeXml(rawXml);

        int created = 0, altered = 0, failed = 0, errors = 0, exceptions = 0;
        var createdMatch = Regex.Match(clean, @"<CREATED>(\d+)</CREATED>", RegexOptions.IgnoreCase);
        if (createdMatch.Success && int.TryParse(createdMatch.Groups[1].Value, out var c)) created = c;

        var alteredMatch = Regex.Match(clean, @"<ALTERED>(\d+)</ALTERED>", RegexOptions.IgnoreCase);
        if (alteredMatch.Success && int.TryParse(alteredMatch.Groups[1].Value, out var a)) altered = a;

        var failedMatch = Regex.Match(clean, @"<FAILED>(\d+)</FAILED>", RegexOptions.IgnoreCase);
        if (failedMatch.Success && int.TryParse(failedMatch.Groups[1].Value, out var f)) failed = f;

        var errorsMatch = Regex.Match(clean, @"<ERRORS>(\d+)</ERRORS>", RegexOptions.IgnoreCase);
        if (errorsMatch.Success && int.TryParse(errorsMatch.Groups[1].Value, out var e)) errors = e;

        var exceptionsMatch = Regex.Match(clean, @"<EXCEPTIONS>(\d+)</EXCEPTIONS>", RegexOptions.IgnoreCase);
        if (exceptionsMatch.Success && int.TryParse(exceptionsMatch.Groups[1].Value, out var ex)) exceptions = ex;

        result.CreatedCount = created;
        result.AlteredCount = altered;
        result.ImportedVouchersCount = created + altered;

        var lineErrorMatches = Regex.Matches(clean, @"<LINEERROR>(.*?)</LINEERROR>", RegexOptions.Singleline | RegexOptions.IgnoreCase);
        foreach (Match m in lineErrorMatches)
        {
            var lineErr = WebUtility.HtmlDecode(m.Groups[1].Value).Trim();
            if (!string.IsNullOrWhiteSpace(lineErr) && !result.Errors.Contains(lineErr))
            {
                result.Errors.Add(lineErr);
            }
        }

        var descMatches = Regex.Matches(clean, @"<DESCRIPTION>(.*?)</DESCRIPTION>", RegexOptions.Singleline | RegexOptions.IgnoreCase);
        foreach (Match m in descMatches)
        {
            var desc = WebUtility.HtmlDecode(m.Groups[1].Value).Trim();
            if (!string.IsNullOrWhiteSpace(desc) && !result.Errors.Contains(desc))
            {
                result.Errors.Add(desc);
            }
        }

        var totalFailures = Math.Max(failed, Math.Max(errors + exceptions, result.Errors.Count));
        result.FailedCount = totalFailures;

        if ((created > 0 || altered > 0) && totalFailures == 0)
        {
            result.Success = true;
            result.Message = $"Successfully imported voucher {voucherNo} into Tally Prime ({company}) on date {voucherDate}.";
        }
        else
        {
            result.Success = false;
            if (result.Errors.Count == 0)
            {
                result.Errors.Add("TallyPrime rejected import without explicit line error. Please verify ledger names, date, and voucher configuration.");
            }
            result.Message = result.Errors[0];
        }

        return result;
    }
}
