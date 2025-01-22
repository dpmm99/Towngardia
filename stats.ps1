# Configuration for regex patterns to search
$regexConfigs = @(
    @{
        File = "src/game/BuildingTypes.ts"
        Pattern = "extends Building"
        Description = "Structure count"
    },
    @{
        File = "src/game/BuildingTypes.ts"
        Pattern = "BuildingCategory\.(NATURAL_RESOURCE|BLOCKER)"
        Description = "Natural formation count"
    },
    @{
        File = "src/game/ResourceTypes.ts"
        Pattern = "(?<=RESOURCE_TYPES =[<>\[\]a-zA-Z0-9\(/\* ,_\-\r\n]*)(?<!Minigames.*)(?<!Mainly math.*)(?<!Citywide needs.*),"
        Description = "Resource types (excluding mainly-for-math, citywide needs, and minigames)"
    },
    @{
        File = "src/game/TechTypes.ts"
        Pattern = "extends Tech"
        Description = "Tech types"
    },
    @{
        File = "src/ui/TutorialOverlay.ts"
        Pattern = "(?<!fieldsNotNeededForExtras,\s*) title: `""
        Description = "Initial tutorial steps"
    },
    @{
        File = "src/ui/TutorialOverlay.ts"
        Pattern = "steps\.push"
        Description = "Tutorial steps viewable later"
    },
    @{
        File = "src/ui/MilestonesMenu.ts"
        Pattern = "milestones\.push"
        Description = "Milestones"
    },
    @{
        File = "src/game/EventTypes.ts"
        Pattern = "(?<!Reward) extends CityEvent"
        Description = "Event types"
    },
    @{
        File = "src/ui/CityView.ts"
        Pattern = "(?<!ProvisioningView) extends CityView"
        Description = "Data views"
    },
    @{
        File = "src/game/AchievementTypes.ts"
        Pattern = "new Achievement(?s)(?=.*const TitleTypes)"
        Description = "Achievements"
    },
    @{
        File = "src/game/AchievementTypes.ts"
        Pattern = "(?s)(?<=const TitleTypes.*)new Achievement"
        Description = "Titles"
    },
    @{
        File = "src/game/Region.ts"
        Pattern = "new Region"
        Description = "Regions"
    }
)

# Function to get size in KB
function Get-SizeInKB {
    param(
        [Parameter(ValueFromPipeline=$true)]
        $Path
    )
    
    process {
        $size = (Get-Item $Path).Length
        return [math]::Round($size / 1024, 2)
    }
}

# Function to count files recursively in subdirectories, excluding the given directory itself
function Get-SubdirectoryFileCount {
    param(
        [string]$Path,
        [string]$ExcludeFolder
    )
    
    $count = 0
    Get-ChildItem $Path -Directory | Where-Object { $_.Name -ne $ExcludeFolder } | ForEach-Object {
        $count += (Get-ChildItem $_.FullName -File | Measure-Object).Count
    }
    return $count
}

Write-Host "`nRunning CLOC analysis..." -ForegroundColor Gray
# Run CLOC (assuming it's installed and in PATH)
try {
    $clocOutput = cloc *.html src/* --quiet --json
    $clocData = $clocOutput | ConvertFrom-Json
    
    # Sum up total lines of code and comments across all languages
    $totalLOC = 0
    $totalComments = 0
    
    $clocData.PSObject.Properties | Where-Object { $_.Name -ne 'header' -and $_.Name -ne 'SUM' } | ForEach-Object {
        $totalLOC += $_.Value.code
        $totalComments += $_.Value.comment
    }
    
    Write-Host "Total lines of code: " -NoNewline
    Write-Host "$totalLOC" -ForegroundColor Yellow
    Write-Host "Total comment lines: " -NoNewline
    Write-Host "$totalComments" -ForegroundColor Yellow

} catch {
    Write-Host "Error running CLOC. Make sure it's installed and in your PATH." -ForegroundColor Red
}

Write-Host "`nCalculating code size..." -ForegroundColor Gray
# Get size of *.html and src/** files
$srcSize = ((Get-ChildItem -Filter "*.html" -File | Measure-Object -Property Length -Sum).Sum + (Get-ChildItem "src" -Recurse -File | Measure-Object -Property Length -Sum).Sum) / 1024
Write-Host "Total code size: " -NoNewline
Write-Host "$([math]::Round($srcSize)) KB" -ForegroundColor Yellow

Write-Host "`nCounting images..." -ForegroundColor Gray
# Count images in assets subdirectories (excluding footprint)
$imageCount = Get-SubdirectoryFileCount -Path "assets" -ExcludeFolder "footprint"
Write-Host "Total images (excluding footprint): " -NoNewline
Write-Host "$imageCount" -ForegroundColor Yellow

Write-Host "`nCounting classes via regex..." -ForegroundColor Gray
# Loop through regex configurations and perform counts
foreach ($config in $regexConfigs) {
    if (Test-Path $config.File) {
        $content = Get-Content $config.File -Raw
        $matches = [regex]::Matches($content, $config.Pattern)
        Write-Host "$($config.Description): " -NoNewline
        Write-Host "$($matches.Count)" -ForegroundColor Yellow
    } else {
        Write-Host "Warning: File $($config.File) not found" -ForegroundColor Red
    }
}

Write-Host "`nCounting minigames..." -ForegroundColor Gray
# Count files in minigame subdirectory (except the utilities file)
$minigameCount = (Get-ChildItem "src/minigame" -Exclude "MinigameUtil.ts").Count
Write-Host "Minigames: " -NoNewline
Write-Host "$minigameCount" -ForegroundColor Yellow

Read-Host -Prompt "`nPress Enter to close"
