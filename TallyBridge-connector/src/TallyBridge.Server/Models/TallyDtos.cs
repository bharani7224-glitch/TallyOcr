using System.Net;
using System.Text.Json.Serialization;

namespace TallyBridge.Server.Models;

public sealed class ApiResponse<T>
{
    [JsonPropertyName("success")]
    public bool Success { get; set; }

    [JsonPropertyName("error_code")]
    public string? ErrorCode { get; set; }

    [JsonPropertyName("message")]
    public string? Message { get; set; }

    [JsonPropertyName("data")]
    public T? Data { get; set; }

    public static ApiResponse<T> Ok(T data, string? message = null)
        => new() { Success = true, Data = data, Message = message };

    public static ApiResponse<T> Fail(string errorCode, string message, T? data = default)
        => new() { Success = false, ErrorCode = errorCode, Message = message, Data = data };
}

public sealed class TallyConnectRequestDto
{
    [JsonPropertyName("autoDetect")]
    public bool? AutoDetect { get; set; } = true;

    [JsonPropertyName("tallyHost")]
    public string? TallyHost { get; set; }

    [JsonPropertyName("host")]
    public string? Host { get; set; }

    [JsonPropertyName("port")]
    public int? Port { get; set; } = 9000;

    [JsonPropertyName("companyName")]
    public string? CompanyName { get; set; }
}

public sealed class TallyInvoiceImportRequestDto
{
    [JsonPropertyName("host")]
    public string? Host { get; set; }

    [JsonPropertyName("port")]
    public int? Port { get; set; }

    [JsonPropertyName("tally_host")]
    public string? TallyHost { get; set; }

    [JsonPropertyName("endpoint")]
    public string? Endpoint { get; set; }

    [JsonPropertyName("options")]
    public TallyImportOptionsDto? Options { get; set; }

    [JsonPropertyName("invoices")]
    public List<TallyInvoiceWrapperDto> Invoices { get; set; } = new();
}

public sealed class TallyImportOptionsDto
{
    [JsonPropertyName("company_name")]
    public string? CompanyName { get; set; }

    [JsonPropertyName("voucher_type")]
    public string? VoucherType { get; set; } = "Purchase";

    [JsonPropertyName("voucher_mode")]
    public string? VoucherMode { get; set; } = "Accounting Invoice"; // "Accounting Invoice", "Item Invoice", "As Voucher"

    [JsonPropertyName("is_invoice")]
    public bool IsInvoice { get; set; } = true;

    [JsonPropertyName("purchase_ledger_name")]
    public string? PurchaseLedgerName { get; set; } = "Purchase";

    [JsonPropertyName("sales_ledger_name")]
    public string? SalesLedgerName { get; set; } = "Sales";

    [JsonPropertyName("main_ledger_name")]
    public string? MainLedgerName { get; set; }

    [JsonPropertyName("party_ledger_name")]
    public string? PartyLedgerName { get; set; }

    [JsonPropertyName("cgst_ledger_name")]
    public string? CgstLedgerName { get; set; } = "CGST";

    [JsonPropertyName("sgst_ledger_name")]
    public string? SgstLedgerName { get; set; } = "SGST";

    [JsonPropertyName("igst_ledger_name")]
    public string? IgstLedgerName { get; set; } = "IGST";

    [JsonPropertyName("output_cgst_ledger_name")]
    public string? OutputCgstLedgerName { get; set; }

    [JsonPropertyName("output_sgst_ledger_name")]
    public string? OutputSgstLedgerName { get; set; }

    [JsonPropertyName("output_igst_ledger_name")]
    public string? OutputIgstLedgerName { get; set; }

    [JsonPropertyName("round_off_ledger_name")]
    public string? RoundOffLedgerName { get; set; } = "Round Off";

    [JsonPropertyName("auto_create_ledgers")]
    public bool AutoCreateLedgers { get; set; } = true;

    [JsonPropertyName("include_line_items")]
    public bool IncludeLineItems { get; set; } = true;

    [JsonPropertyName("include_inventory_items")]
    public bool IncludeInventoryItems { get; set; } = false;

    [JsonPropertyName("gst_wise_summarized")]
    public bool GstWiseSummarized { get; set; } = true;

    [JsonPropertyName("port")]
    public int? Port { get; set; }

    [JsonPropertyName("host")]
    public string? Host { get; set; }

    [JsonPropertyName("tally_host")]
    public string? TallyHost { get; set; }

    [JsonPropertyName("educational_mode")]
    public bool EducationalMode { get; set; } = false;

    [JsonPropertyName("financial_year_start")]
    public string? FinancialYearStart { get; set; }

    [JsonPropertyName("financial_year_end")]
    public string? FinancialYearEnd { get; set; }

    [JsonPropertyName("books_date")]
    public string? BooksDate { get; set; }

    [JsonPropertyName("narration")]
    public string? Narration { get; set; }
}

public sealed class TallyInvoiceWrapperDto
{
    [JsonPropertyName("invoice")]
    public TallyInvoiceHeaderDto? Invoice { get; set; }

    [JsonPropertyName("seller")]
    public TallyEntityDto? Seller { get; set; }

    [JsonPropertyName("buyer")]
    public TallyEntityDto? Buyer { get; set; }

    [JsonPropertyName("party_name")]
    public string? PartyName { get; set; }

    [JsonPropertyName("items")]
    public List<TallyItemDto> Items { get; set; } = new();

    [JsonPropertyName("line_items")]
    public List<TallyItemDto>? LineItems { set { if (value != null && Items.Count == 0) Items = value; } }

    [JsonPropertyName("lineItems")]
    public List<TallyItemDto>? LineItemsCamel { set { if (value != null && Items.Count == 0) Items = value; } }

    [JsonPropertyName("invoice_items")]
    public List<TallyItemDto>? InvoiceItems { set { if (value != null && Items.Count == 0) Items = value; } }

    [JsonPropertyName("gst_groups")]
    public List<TallyGstGroupDto> GstGroups { get; set; } = new();

    [JsonPropertyName("totals")]
    public TallyTotalsDto? Totals { get; set; }
}

public sealed class TallyGstGroupDto
{
    [JsonPropertyName("rate")]
    public decimal? Rate { get; set; }

    [JsonPropertyName("label")]
    public string? Label { get; set; }

    [JsonPropertyName("ledger_name")]
    public string? LedgerName { get; set; }

    [JsonPropertyName("taxable_amount")]
    public decimal? TaxableAmount { get; set; }

    [JsonPropertyName("cgst_amount")]
    public decimal? CgstAmount { get; set; }

    [JsonPropertyName("sgst_amount")]
    public decimal? SgstAmount { get; set; }

    [JsonPropertyName("igst_amount")]
    public decimal? IgstAmount { get; set; }

    [JsonPropertyName("total_tax")]
    public decimal? TotalTax { get; set; }

    [JsonPropertyName("total_amount")]
    public decimal? TotalAmount { get; set; }
}

public sealed class TallyInvoiceHeaderDto
{
    [JsonPropertyName("invoice_number")]
    public string? InvoiceNumber { get; set; }

    [JsonPropertyName("invoice_no")]
    public string? InvoiceNo { get; set; }

    [JsonPropertyName("bill_number")]
    public string? BillNumber { get; set; }

    [JsonPropertyName("voucher_number")]
    public string? VoucherNumber { get; set; }

    [JsonPropertyName("invoice_date")]
    public string? InvoiceDate { get; set; }

    [JsonPropertyName("bill_date")]
    public string? BillDate { get; set; }

    [JsonPropertyName("entry_date")]
    public string? EntryDate { get; set; }

    [JsonPropertyName("voucher_date")]
    public string? VoucherDate { get; set; }

    [JsonPropertyName("date")]
    public string? Date { get; set; }

    [JsonPropertyName("buyer_order_number")]
    public string? BuyerOrderNumber { get; set; }

    [JsonPropertyName("irn")]
    public string? Irn { get; set; }

    [JsonPropertyName("narration")]
    public string? Narration { get; set; }

    [JsonPropertyName("remarks")]
    public string? Remarks { get; set; }

    [JsonPropertyName("note")]
    public string? Note { get; set; }

    public string GetEffectiveInvoiceNumber()
        => !string.IsNullOrWhiteSpace(InvoiceNumber) ? InvoiceNumber.Trim()
         : !string.IsNullOrWhiteSpace(InvoiceNo) ? InvoiceNo.Trim()
         : !string.IsNullOrWhiteSpace(BillNumber) ? BillNumber.Trim()
         : !string.IsNullOrWhiteSpace(VoucherNumber) ? VoucherNumber.Trim()
         : "INV-" + DateTime.Now.ToString("yyyyMMddHHmmss");

    public string? GetEffectiveInvoiceDate()
        => !string.IsNullOrWhiteSpace(InvoiceDate) ? InvoiceDate.Trim()
         : !string.IsNullOrWhiteSpace(BillDate) ? BillDate.Trim()
         : !string.IsNullOrWhiteSpace(VoucherDate) ? VoucherDate.Trim()
         : !string.IsNullOrWhiteSpace(Date) ? Date.Trim()
         : null;

    public string? GetEffectiveVoucherDate()
        => !string.IsNullOrWhiteSpace(VoucherDate) ? VoucherDate.Trim()
         : !string.IsNullOrWhiteSpace(EntryDate) ? EntryDate.Trim()
         : !string.IsNullOrWhiteSpace(InvoiceDate) ? InvoiceDate.Trim()
         : !string.IsNullOrWhiteSpace(Date) ? Date.Trim()
         : null;
}

public sealed class TallyEntityDto
{
    [JsonPropertyName("name")]
    public string? Name { get; set; }

    [JsonPropertyName("gstin")]
    public string? Gstin { get; set; }

    [JsonPropertyName("address")]
    public string? Address { get; set; }

    [JsonPropertyName("state")]
    public string? State { get; set; }
}

public sealed class TallyItemDto
{
    [JsonPropertyName("description")]
    public string? Description { get; set; }

    [JsonPropertyName("item_name")]
    public string? ItemName { get; set; }

    [JsonPropertyName("hsn_sac")]
    public string? HsnSac { get; set; }

    [JsonPropertyName("quantity")]
    public decimal? Quantity { get; set; }

    [JsonPropertyName("qty")]
    public decimal? Qty { get => Quantity; set { if (value.HasValue && !Quantity.HasValue) Quantity = value; } }

    [JsonPropertyName("billed_qty")]
    public decimal? BilledQty { get => Quantity; set { if (value.HasValue && !Quantity.HasValue) Quantity = value; } }

    [JsonPropertyName("unit_price")]
    public decimal? UnitPrice { get; set; }

    [JsonPropertyName("rate")]
    public decimal? Rate { get => UnitPrice; set { if (value.HasValue && !UnitPrice.HasValue) UnitPrice = value; } }

    [JsonPropertyName("price")]
    public decimal? Price { get => UnitPrice; set { if (value.HasValue && !UnitPrice.HasValue) UnitPrice = value; } }

    [JsonPropertyName("taxable_value")]
    public decimal? TaxableValue { get; set; }

    [JsonPropertyName("taxable_amount")]
    public decimal? TaxableAmount { get => TaxableValue; set { if (value.HasValue && !TaxableValue.HasValue) TaxableValue = value; } }

    [JsonPropertyName("amount")]
    public decimal? Amount { get => TaxableValue; set { if (value.HasValue && !TaxableValue.HasValue) TaxableValue = value; } }

    [JsonPropertyName("cgst_amount")]
    public decimal? CgstAmount { get; set; }

    [JsonPropertyName("sgst_amount")]
    public decimal? SgstAmount { get; set; }

    [JsonPropertyName("igst_amount")]
    public decimal? IgstAmount { get; set; }

    [JsonPropertyName("line_total")]
    public decimal? LineTotal { get; set; }

    [JsonPropertyName("unit")]
    public string? Unit { get; set; } = "Nos";

    [JsonPropertyName("uom")]
    public string? Uom { set { if (!string.IsNullOrWhiteSpace(value)) Unit = value; } }

    [JsonPropertyName("unit_of_measure")]
    public string? UnitOfMeasure { set { if (!string.IsNullOrWhiteSpace(value)) Unit = value; } }

    [JsonPropertyName("tax_rate")]
    public decimal? TaxRate { get; set; }

    [JsonPropertyName("taxRate")]
    public decimal? TaxRateCamel { set { if (value.HasValue && !TaxRate.HasValue) TaxRate = value; } }

    [JsonPropertyName("gst_rate")]
    public decimal? GstRate { set { if (value.HasValue && !TaxRate.HasValue) TaxRate = value; } }
}

public sealed class TallyTotalsDto
{
    [JsonPropertyName("subtotal")]
    public decimal? Subtotal { get; set; }

    [JsonPropertyName("taxable_amount")]
    public decimal? TaxableAmount { get; set; }

    [JsonPropertyName("cgst_total")]
    public decimal? CgstTotal { get; set; }

    [JsonPropertyName("cgst_amount")]
    public decimal? CgstAmount { get => CgstTotal; set { if (value.HasValue && !CgstTotal.HasValue) CgstTotal = value; } }

    [JsonPropertyName("sgst_total")]
    public decimal? SgstTotal { get; set; }

    [JsonPropertyName("sgst_amount")]
    public decimal? SgstAmount { get => SgstTotal; set { if (value.HasValue && !SgstTotal.HasValue) SgstTotal = value; } }

    [JsonPropertyName("igst_total")]
    public decimal? IgstTotal { get; set; }

    [JsonPropertyName("igst_amount")]
    public decimal? IgstAmount { get => IgstTotal; set { if (value.HasValue && !IgstTotal.HasValue) IgstTotal = value; } }

    [JsonPropertyName("round_off")]
    public decimal? RoundOff { get; set; }

    [JsonPropertyName("grand_total")]
    public decimal? GrandTotal { get; set; }

    [JsonPropertyName("total_amount")]
    public decimal? TotalAmount { get => GrandTotal; set { if (value.HasValue && !GrandTotal.HasValue) GrandTotal = value; } }

    [JsonPropertyName("net_amount")]
    public decimal? NetAmount { get => GrandTotal; set { if (value.HasValue && !GrandTotal.HasValue) GrandTotal = value; } }
}

public sealed class TallyImportResultDto
{
    [JsonPropertyName("success")]
    public bool Success { get; set; }

    [JsonPropertyName("imported_vouchers_count")]
    public int ImportedVouchersCount { get; set; }

    [JsonPropertyName("importedVouchersCount")]
    public int ImportedVouchersCountCamel { set => ImportedVouchersCount = value; }

    [JsonPropertyName("created_count")]
    public int CreatedCount { get; set; }

    [JsonPropertyName("createdCount")]
    public int CreatedCountCamel { set => CreatedCount = value; }

    [JsonPropertyName("altered_count")]
    public int AlteredCount { get; set; }

    [JsonPropertyName("alteredCount")]
    public int AlteredCountCamel { set => AlteredCount = value; }

    [JsonPropertyName("failed_count")]
    public int FailedCount { get; set; }

    [JsonPropertyName("failedCount")]
    public int FailedCountCamel { set => FailedCount = value; }

    [JsonPropertyName("errors")]
    public List<string> Errors { get; set; } = new();

    [JsonPropertyName("message")]
    public string? Message { get; set; }

    [JsonPropertyName("voucherDate")]
    public string? VoucherDate { get; set; }

    [JsonPropertyName("voucherNumber")]
    public string? VoucherNumber { get; set; }

    [JsonPropertyName("company")]
    public string? Company { get; set; }

    [JsonPropertyName("amount")]
    public decimal? Amount { get; set; }

    [JsonPropertyName("raw_xml_response")]
    public string? RawXmlResponse { get; set; }

    [JsonPropertyName("raw_xml")]
    public string? RawXml { set { if (value != null && RawXmlResponse == null) RawXmlResponse = value; } }
}

public sealed class TallyHierarchyGroupItemDto
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;
}

public sealed class TallyHierarchyParentDto
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("child")]
    public List<TallyHierarchyGroupItemDto> Child { get; set; } = new();
}

public sealed class TallyHierarchyGroupDto
{
    [JsonPropertyName("parent")]
    public List<TallyHierarchyParentDto> Parent { get; set; } = new();
}

public sealed class TallyHierarchyResponseDto
{
    [JsonPropertyName("groups")]
    public List<TallyHierarchyGroupDto> Groups { get; set; } = new();
}

public sealed class ConnectorStatePayload
{
    [JsonPropertyName("company")]
    public string? Company { get; set; }

    [JsonPropertyName("companyName")]
    public string? CompanyName { get; set; }

    [JsonPropertyName("deviceId")]
    public string? DeviceId { get; set; }

    [JsonPropertyName("tallyRunning")]
    public bool TallyRunning { get; set; }

    [JsonPropertyName("tallyReachable")]
    public bool TallyReachable { get; set; }

    [JsonPropertyName("companies")]
    public List<string> Companies { get; set; } = new();
}

public sealed class TallyLedger
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("parentGroup")]
    public string ParentGroup { get; set; } = string.Empty;

    [JsonPropertyName("parent")]
    public string? Parent { set { if (!string.IsNullOrEmpty(value) && string.IsNullOrEmpty(ParentGroup)) ParentGroup = value; } }

    [JsonPropertyName("taxType")]
    public string? TaxType { get; set; }

    [JsonPropertyName("gstDutyHead")]
    public string? GstDutyHead { get; set; }

    [JsonPropertyName("taxRate")]
    public decimal? TaxRate { get; set; }

    [JsonPropertyName("rateOfTaxCalculation")]
    public decimal? RateOfTaxCalculation { set { if (value.HasValue && !TaxRate.HasValue) TaxRate = value; } }

    [JsonPropertyName("partyGstin")]
    public string? PartyGstin { get; set; }

    [JsonPropertyName("stateName")]
    public string? StateName { get; set; }
}

public sealed class TallyLedgerItemDto
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("parentGroup")]
    public string ParentGroup { get; set; } = string.Empty;

    [JsonPropertyName("partyGstin")]
    public string? PartyGstin { get; set; }

    [JsonPropertyName("taxType")]
    public string? TaxType { get; set; }

    [JsonPropertyName("gstDutyHead")]
    public string? GstDutyHead { get; set; }

    [JsonPropertyName("stateName")]
    public string? StateName { get; set; }
}

public sealed class TallyLedgerGroup
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("ledgers")]
    public List<TallyLedger> Ledgers { get; set; } = new();
}

public sealed class TallyTaxLedgersResponseDto
{
    [JsonPropertyName("cgstLedgers")]
    public List<string> CgstLedgers { get; set; } = new();

    [JsonPropertyName("sgstLedgers")]
    public List<string> SgstLedgers { get; set; } = new();

    [JsonPropertyName("igstLedgers")]
    public List<string> IgstLedgers { get; set; } = new();

    [JsonPropertyName("otherTaxLedgers")]
    public List<string> OtherTaxLedgers { get; set; } = new();
}

public sealed class TallyVoucherTypeDto
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("parent")]
    public string? Parent { get; set; }

    [JsonPropertyName("coreType")]
    public string? CoreType { get; set; }

    [JsonPropertyName("numberingMethod")]
    public string? NumberingMethod { get; set; }

    [JsonPropertyName("isActive")]
    public bool IsActive { get; set; } = true;
}

public sealed class TallyConnectionResponseDto
{
    [JsonPropertyName("connected")]
    public bool Connected { get; set; }

    [JsonPropertyName("error_code")]
    public string? ErrorCode { get; set; }

    [JsonPropertyName("host")]
    public string Host { get; set; } = "127.0.0.1";

    [JsonPropertyName("port")]
    public int Port { get; set; } = 9000;

    [JsonPropertyName("companyName")]
    public string? CompanyName { get; set; }

    [JsonPropertyName("endpoint")]
    public string? Endpoint { get; set; }

    [JsonPropertyName("status")]
    public int Status { get; set; }

    [JsonPropertyName("message")]
    public string? Message { get; set; }

    [JsonPropertyName("latencyMs")]
    public long LatencyMs { get; set; }

    [JsonPropertyName("company")]
    public TallyCompanyDetailsDto? Company { get; set; }

    [JsonPropertyName("availableCompanies")]
    public List<TallyCompanyDto> AvailableCompanies { get; set; } = new();

    [JsonPropertyName("taxUnits")]
    public List<TallyTaxUnitDto> TaxUnits { get; set; } = new();

    [JsonPropertyName("errors")]
    public List<string>? Errors { get; set; }
}

public sealed class TallyCompanyDto
{
    [JsonPropertyName("companyName")]
    public string CompanyName { get; set; } = string.Empty;

    [JsonPropertyName("gstin")]
    public string? Gstin { get; set; }

    [JsonPropertyName("state")]
    public string? State { get; set; }
}

public sealed class TallyTaxUnitDto
{
    [JsonPropertyName("taxType")]
    public string? TaxType { get; set; }

    [JsonPropertyName("gstin")]
    public string? Gstin { get; set; }

    [JsonPropertyName("state")]
    public string? State { get; set; }
}

public sealed class TallyCompanyDetailsDto
{
    [JsonPropertyName("companyName")]
    public string CompanyName { get; set; } = string.Empty;

    [JsonPropertyName("gstin")]
    public string? Gstin { get; set; }

    [JsonPropertyName("state")]
    public string? State { get; set; }

    [JsonPropertyName("gstRegistrationType")]
    public string? GstRegistrationType { get; set; }

    [JsonPropertyName("address")]
    public string? Address { get; set; }

    [JsonPropertyName("pincode")]
    public string? Pincode { get; set; }

    [JsonPropertyName("country")]
    public string? Country { get; set; }

    [JsonPropertyName("financialYearFrom")]
    public string? FinancialYearFrom { get; set; }

    [JsonPropertyName("booksFrom")]
    public string? BooksFrom { get; set; }

    [JsonPropertyName("email")]
    public string? Email { get; set; }

    [JsonPropertyName("phoneNumber")]
    public string? PhoneNumber { get; set; }

    [JsonPropertyName("currencySymbol")]
    public string? CurrencySymbol { get; set; }

    [JsonPropertyName("taxUnits")]
    public List<TallyTaxUnitDto> TaxUnits { get; set; } = new();
}
