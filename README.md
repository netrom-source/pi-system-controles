# Pi System Controls

Obsidian plugin for Raspberry Pi systems that provides battery status for Waveshare UPS HAT (E) and quick access to common controls such as Wi-Fi, Bluetooth, screen brightness and power management.

## Features

- Shows UPS battery percentage and estimated time in the status bar.
- Updates battery information every 10 seconds via I²C at address `0x2D`.
- System menu (⚙️) with toggles for Wi-Fi and Bluetooth, brightness slider, and reboot/power-off buttons.
- All controls are accessible through Obsidian hotkeys.
- Ensures screen brightness never falls below 10%.

> Battery status requires the `i2c-bus` module. If it isn't available, the plugin will still load but battery information will remain unknown.

## Development

```
npm install
npm run build
```

## Testing

```
npm test
```

> This plugin targets Linux environments and requires access to `rfkill`, `/sys/class/backlight`, and I²C bus 1.
