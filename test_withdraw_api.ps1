$baseUrl = "http://localhost:5000/api"
$driverEmail = "test.driver@example.com"
$driverPassword = "password123"

# 1. Login to get Token
$loginBody = @{
    email = $driverEmail
    password = $driverPassword
} | ConvertTo-Json

$loginResponse = Invoke-RestMethod -Uri "$baseUrl/drivers/login" -Method Post -Body $loginBody -ContentType "application/json"
$token = $loginResponse.token

Write-Host "Driver Login Successful. Token received." -ForegroundColor Green

# 2. Driver Requests Withdrawal
$withdrawBody = @{
    amount = 500
    description = "Driver ne withdraw ki request chali curl se!"
} | ConvertTo-Json

$headers = @{
    Authorization = "Bearer $token"
}

$withdrawResponse = Invoke-RestMethod -Uri "$baseUrl/wallet/withdraw" -Method Post -Body $withdrawBody -ContentType "application/json" -Headers $headers

Write-Host "Withdrawal Request Response:" -ForegroundColor Cyan
$withdrawResponse | ConvertTo-Json
