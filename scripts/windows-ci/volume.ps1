# Create and mount ONLY a new disposable VHD in the CI temp folder.
# No physical disk or existing volume is selected or formatted.
param([Parameter(Mandatory=$true)][string]$ImagePath)
$ErrorActionPreference = 'Stop'
if (Test-Path -LiteralPath $ImagePath) { throw 'Refusing to reuse an existing disk image' }
$commands = @"
create vdisk file="$ImagePath" maximum=128 type=expandable
select vdisk file="$ImagePath"
attach vdisk
exit
"@
$commands | diskpart.exe | Out-Host
if ($LASTEXITCODE -ne 0) { throw 'DiskPart failed to create/attach the test image' }
$image = Get-DiskImage -ImagePath $ImagePath -ErrorAction Stop
if (-not $image.Attached) { throw 'Test image is not attached' }
$disk = $image | Get-Disk
if ($disk.PartitionStyle -ne 'RAW') { throw 'Refusing to format a non-empty disk image' }
$volume = $disk | Initialize-Disk -PartitionStyle GPT -PassThru |
    New-Partition -UseMaximumSize -AssignDriveLetter |
    Format-Volume -FileSystem NTFS -NewFileSystemLabel 'DeepClean-CI' -Confirm:$false
if (-not $volume.DriveLetter) { throw 'Test image has no drive letter' }
# Last stdout line is consumed by run.mjs; other output remains diagnostic.
Write-Output "DEEPCLEAN_TEST_VOLUME=$($volume.DriveLetter):\"
