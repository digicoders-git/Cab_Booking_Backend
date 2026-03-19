$baseUrl = "http://localhost:5000/api"
$adminEmail = "admin@example.com"
$adminPassword = "7068"  # Current password in DB

# 1. Login as Admin
$loginBody = @{
    email = $adminEmail
    password = $adminPassword
} | ConvertTo-Json

$loginResponse = Invoke-RestMethod -Uri "$baseUrl/admin/login" -Method Post -Body $loginBody -ContentType "application/json"
$token = $loginResponse.token

Write-Host "Admin Login Successful." -ForegroundColor Green

# 2. View Pending Payouts (See if we can see the Driver's Name now)
$headers = @{
    Authorization = "Bearer $token"
}

$payoutsResponse = Invoke-RestMethod -Uri "$baseUrl/wallet/admin/payouts/pending" -Method Get -Headers $headers

Write-Host "Admin Viewing Pending Payouts (With Driver Details):" -ForegroundColor Cyan
$payoutsResponse | ConvertTo-Json
