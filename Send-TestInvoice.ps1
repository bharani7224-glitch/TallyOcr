# Test Invoice Pusher for TallyPrime
# Simulates the exact voucher import done by TallyBridge Connector

param(
    [string]$Company = "Bharani Tech",
    [string]$PartyLedger = "XYZ Supplies Pvt Ltd",
    [string]$PurchaseLedger = "Purchase",
    [decimal]$Amount = 1500.00,
    [string]$VoucherNo = "",
    [string]$Date = "" # Format: yyyyMMdd (e.g. 20261101). Default: 1st of current month for Educational Mode compatibility
)

if ([string]::IsNullOrWhiteSpace($VoucherNo)) {
    $VoucherNo = "INV-" + (Get-Date -Format "yyMMdd-HHmmss")
}

# Tally Educational Mode only accepts 1st, 2nd, or 31st of any month
if ([string]::IsNullOrWhiteSpace($Date)) {
    $Date = (Get-Date).ToString("yyyyMM01")
}

$DebitAmount = (-$Amount).ToString("0.00")
$CreditAmount = ($Amount).ToString("0.00")

$xml = @"
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>$Company</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Purchase" ACTION="Create" OBJVIEW="Accounting Voucher View">
            <DATE>$Date</DATE>
            <EFFECTIVEDATE>$Date</EFFECTIVEDATE>
            <VOUCHERTYPENAME>Purchase</VOUCHERTYPENAME>
            <VOUCHERNUMBER>$VoucherNo</VOUCHERNUMBER>
            <REFERENCE>$VoucherNo</REFERENCE>
            <PARTYLEDGERNAME>$PartyLedger</PARTYLEDGERNAME>
            <PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>
            <NARRATION>Test purchase invoice created by TallyBridge test script</NARRATION>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>$PurchaseLedger</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <ISPARTYLEDGER>No</ISPARTYLEDGER>
              <AMOUNT>$DebitAmount</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>$PartyLedger</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <ISPARTYLEDGER>Yes</ISPARTYLEDGER>
              <AMOUNT>$CreditAmount</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
          </VOUCHER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>
"@

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host " Pushing Test Invoice to TallyPrime:" -ForegroundColor Yellow
Write-Host "   Company:         $Company"
Write-Host "   Voucher No:      $VoucherNo"
Write-Host "   Date:            $Date (1st of month for Edu Mode)"
Write-Host "   Party Ledger:    $PartyLedger"
Write-Host "   Purchase Ledger: $PurchaseLedger"
Write-Host "   Amount:          Rs. $Amount"
Write-Host "==========================================" -ForegroundColor Cyan

try {
    $resp = Invoke-WebRequest -Uri "http://127.0.0.1:9000" -Method Post -Body $xml -ContentType "text/xml" -TimeoutSec 10 -UseBasicParsing
    $raw = $resp.Content

    if ($raw -match "<CREATED>(\d+)</CREATED>") {
        $created = $matches[1]
        if ([int]$created -gt 0) {
            Write-Host "`nSUCCESS: Voucher $VoucherNo created successfully in TallyPrime! ($created created)" -ForegroundColor Green
            Write-Host "Open TallyPrime -> 'Day Book' to view the voucher.`n" -ForegroundColor Cyan
            exit 0
        }
    }

    if ($raw -match "<LINEERROR>(.*?)</LINEERROR>") {
        Write-Host "`nTALLY ERROR: $($matches[1])" -ForegroundColor Red
    } else {
        Write-Host "`nRAW TALLY RESPONSE:`n$raw" -ForegroundColor Yellow
    }
} catch {
    Write-Host "`nFAILED to connect to TallyPrime!" -ForegroundColor Red
    Write-Host "Make sure TallyPrime is open with HTTP server enabled on port 9000.`nError: $($_.Exception.Message)" -ForegroundColor Red
}
