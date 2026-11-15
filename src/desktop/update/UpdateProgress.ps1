# A small WPF host survives Electron shutdown; colors and labels come from the active organization.
function New-UpdateProgress($Presentation) {
    Add-Type -AssemblyName PresentationFramework
    $colors = $Presentation.colors
    foreach ($name in @('background', 'surface', 'text', 'accent')) {
        if ([string]$colors.$name -notmatch '^#[a-fA-F0-9]{6}$') { throw 'Invalid update window colors.' }
    }
    [xml]$markup = @'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        Width="520" Height="340" WindowStyle="None" ResizeMode="NoResize"
        AllowsTransparency="True" Background="Transparent" WindowStartupLocation="CenterScreen"
        ShowInTaskbar="True" Topmost="True" FontFamily="Segoe UI" FontSize="14">
  <Border Name="Card" CornerRadius="18" BorderThickness="1" Padding="30">
    <StackPanel>
      <TextBlock Name="Brand" FontSize="12" FontWeight="SemiBold" Margin="0,0,0,22"/>
      <TextBlock Name="Status" FontSize="23" FontWeight="SemiBold" TextWrapping="Wrap" Margin="0,0,0,14"/>
      <TextBlock Name="Detail" TextWrapping="Wrap" Margin="0,0,0,24"/>
      <ProgressBar Name="Progress" Height="5" IsIndeterminate="True" BorderThickness="0"/>
      <Button Name="CloseAction" Visibility="Collapsed" HorizontalAlignment="Right" Padding="20,7" Margin="0,20,0,0">
        <Button.Template>
          <ControlTemplate TargetType="Button">
            <Border Background="{TemplateBinding Background}" CornerRadius="8" Padding="{TemplateBinding Padding}">
              <ContentPresenter HorizontalAlignment="Center"/>
            </Border>
          </ControlTemplate>
        </Button.Template>
      </Button>
    </StackPanel>
  </Border>
</Window>
'@
    $reader = New-Object System.Xml.XmlNodeReader $markup
    $window = [Windows.Markup.XamlReader]::Load($reader)
    $window.Title = 'OrbitKanban'
    $window.FindName('Card').Background = $colors.background
    $window.FindName('Card').BorderBrush = $colors.surface
    $window.Foreground = $colors.text
    $window.FindName('Brand').Foreground = $colors.accent
    $window.FindName('Brand').Text = "OrbitKanban  /  $($Presentation.text.title)"
    $window.FindName('Status').Text = $Presentation.text.waiting
    $window.FindName('Detail').Text = $Presentation.text.detail
    $window.FindName('Progress').Foreground = $colors.accent
    $window.FindName('Progress').Background = $colors.surface
    $window.FindName('CloseAction').Content = $Presentation.text.close
    $window.FindName('CloseAction').Background = $colors.accent
    $window.FindName('CloseAction').Foreground = $colors.background
    $window.Tag = $false
    $window.Add_Closing({ param($sender, $eventArgs) if (-not $sender.Tag) { $eventArgs.Cancel = $true } })
    $window.Add_MouseLeftButtonDown({ param($sender) $sender.DragMove() })
    $window.FindName('CloseAction').Add_Click({ param($sender) $owner = [Windows.Window]::GetWindow($sender); $owner.Tag = $true; $owner.Close() })
    $window.Show()
    return $window
}

function Update-ProgressWindow([string]$Status, [string]$Detail = '', [switch]$Failure) {
    if (-not $script:progressWindow) { return }
    $script:progressWindow.FindName('Status').Text = $Status
    if ($Detail) { $script:progressWindow.FindName('Detail').Text = $Detail }
    if ($Failure) {
        $script:progressWindow.SizeToContent = 'Height'
        $script:progressWindow.FindName('Progress').Visibility = 'Collapsed'
        $script:progressWindow.FindName('CloseAction').Visibility = 'Visible'
        $script:progressWindow.FindName('CloseAction').Focus() | Out-Null
    }
    Invoke-ProgressEvents
}

function Invoke-ProgressEvents {
    if (-not $script:progressWindow) { return }
    $frame = New-Object Windows.Threading.DispatcherFrame
    $callback = [Windows.Threading.DispatcherOperationCallback]{ param($state) $state.Continue = $false; return $null }
    $script:progressWindow.Dispatcher.BeginInvoke([Windows.Threading.DispatcherPriority]::Background, $callback, $frame) | Out-Null
    [Windows.Threading.Dispatcher]::PushFrame($frame)
}
