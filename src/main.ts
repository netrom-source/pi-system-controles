import { App, Plugin, PluginSettingTab, Setting, Notice } from 'obsidian';
import { exec } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';

interface PiSystemControlsSettings {
useSudo: boolean;
}

const DEFAULT_SETTINGS: PiSystemControlsSettings = {
useSudo: false
};

interface BatteryInfo {
percent: number;
charging: boolean;
minutes: number;
}

export default class PiSystemControlsPlugin extends Plugin {
settings: PiSystemControlsSettings = DEFAULT_SETTINGS;
statusEl!: HTMLElement;
gearEl!: HTMLElement;
menuEl: HTMLElement | null = null;
interval!: ReturnType<typeof setInterval>;
backlightPath: string | null = null;

async onload() {
await this.loadSettings();

this.statusEl = this.addStatusBarItem();
this.statusEl.setText('-- % (ukendt)');

this.gearEl = this.addStatusBarItem();
this.gearEl.setText('⚙️');
this.gearEl.addClass('pi-system-gear');
this.gearEl.addEventListener('click', () => this.toggleMenu());

this.buildMenu();

document.addEventListener('click', this.handleDocClick, true);
document.addEventListener('keydown', this.handleKeyDown, true);

this.interval = setInterval(() => this.refreshBattery(), 10000);
this.refreshBattery();

this.addCommand({ id: 'toggle-wifi', name: 'Toggle Wi-Fi', callback: () => this.toggleWifi() });
this.addCommand({ id: 'toggle-bluetooth', name: 'Toggle Bluetooth', callback: () => this.toggleBluetooth() });
this.addCommand({ id: 'brightness-up', name: 'Increase brightness', callback: () => this.adjustBrightness(10) });
this.addCommand({ id: 'brightness-down', name: 'Decrease brightness', callback: () => this.adjustBrightness(-10) });

 this.addSettingTab(new PiSystemControlsSettingTab(this.app, this));
}

onunload() {
clearInterval(this.interval);
document.removeEventListener('click', this.handleDocClick, true);
document.removeEventListener('keydown', this.handleKeyDown, true);
this.menuEl?.remove();
}

async loadSettings() {
this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
}

async saveSettings() {
await this.saveData(this.settings);
}

handleDocClick = (evt: MouseEvent) => {
if (this.menuEl && !this.menuEl.contains(evt.target as Node) && !this.gearEl.contains(evt.target as Node)) {
this.hideMenu();
}
};

handleKeyDown = (evt: KeyboardEvent) => {
if (evt.key === 'Escape') this.hideMenu();
};

async refreshBattery() {
const info = await readBatteryInfo();
if (!info) {
this.statusEl.setText('-- % (ukendt)');
return;
}
const time = formatMinutes(info.minutes);
if (info.charging) {
this.statusEl.setText(`${info.percent} % (${time} til fuld opladning)`);
} else {
this.statusEl.setText(`${info.percent} % (${time})`);
}
}

buildMenu() {
this.menuEl = createDiv({ cls: 'pi-system-menu hidden' });
document.body.appendChild(this.menuEl);

// Wi-Fi toggle
const wifiRow = this.menuEl.createDiv({ cls: 'pi-row' });
wifiRow.createSpan({ text: 'Wi-Fi' });
const wifiInput = wifiRow.createEl('input', { type: 'checkbox' });
wifiInput.onchange = async () => {
await this.setRfkill('wifi', wifiInput.checked);
};
getRfkillState('wifi').then(state => { if (state != null) wifiInput.checked = state; });

// Bluetooth toggle
const btRow = this.menuEl.createDiv({ cls: 'pi-row' });
btRow.createSpan({ text: 'Bluetooth' });
const btInput = btRow.createEl('input', { type: 'checkbox' });
btInput.onchange = async () => {
await this.setRfkill('bluetooth', btInput.checked);
};
getRfkillState('bluetooth').then(state => { if (state != null) btInput.checked = state; });

// Brightness slider
const brRow = this.menuEl.createDiv({ cls: 'pi-row' });
brRow.createSpan({ text: 'Lysstyrke' });
const brInput = brRow.createEl('input', { type: 'range' });
brInput.min = '10';
brInput.max = '100';
brInput.oninput = async () => {
const val = parseInt(brInput.value, 10);
await this.setBrightness(val);
};
getBrightness().then(v => { if (v != null) brInput.value = v.toString(); });

// Reboot button
const rbRow = this.menuEl.createDiv({ cls: 'pi-row' });
const rbBtn = rbRow.createEl('button', { text: 'Genstart' });
rbBtn.onclick = () => this.runCmd('systemctl reboot');

// Shutdown button
const sdRow = this.menuEl.createDiv({ cls: 'pi-row' });
const sdBtn = sdRow.createEl('button', { text: 'Sluk' });
sdBtn.onclick = () => this.runCmd('systemctl poweroff');
}

toggleMenu() {
if (!this.menuEl) return;
if (this.menuEl.hasClass('hidden')) {
this.menuEl.removeClass('hidden');
} else {
this.menuEl.addClass('hidden');
}
}

hideMenu() { this.menuEl?.addClass('hidden'); }

async toggleWifi() {
const state = await getRfkillState('wifi');
if (state != null) await this.setRfkill('wifi', !state);
}

async toggleBluetooth() {
const state = await getRfkillState('bluetooth');
if (state != null) await this.setRfkill('bluetooth', !state);
}

async adjustBrightness(delta: number) {
const current = await getBrightness();
if (current == null) return;
const next = Math.min(100, Math.max(10, current + delta));
await this.setBrightness(next);
}

async setBrightness(percent: number) {
if (!this.backlightPath) {
this.backlightPath = await findBacklight();
if (!this.backlightPath) {
new Notice('Ingen baggrundslys-enhed');
return;
}
}
const maxStr = await fs.readFile(path.join(this.backlightPath, 'max_brightness'), 'utf8');
const max = parseInt(maxStr.trim(), 10);
const min = Math.round(max * 0.1);
const value = Math.round((percent / 100) * (max - min) + min);
await fs.writeFile(path.join(this.backlightPath, 'brightness'), value.toString());
}

async setRfkill(target: 'wifi' | 'bluetooth', on: boolean) {
const action = on ? 'unblock' : 'block';
await execAsync(`rfkill ${action} ${target}`);
}

runCmd(cmd: string) {
const full = this.settings.useSudo ? `sudo ${cmd}` : cmd;
exec(full);
}
}

class PiSystemControlsSettingTab extends PluginSettingTab {
plugin: PiSystemControlsPlugin;

constructor(app: App, plugin: PiSystemControlsPlugin) {
super(app, plugin);
this.plugin = plugin;
}

display(): void {
const { containerEl } = this;
containerEl.empty();
new Setting(containerEl)
.setName('Use sudo for power commands')
.addToggle(t => t.setValue(this.plugin.settings.useSudo)
.onChange(async (value) => {
this.plugin.settings.useSudo = value;
await this.plugin.saveSettings();
}));
}
}

async function getRfkillState(target: 'wifi' | 'bluetooth'): Promise<boolean | null> {
try {
const out = await execAsync(`rfkill list ${target}`);
return !/Soft blocked: yes/.test(out);
} catch (e) {
console.error(e);
return null;
}
}

async function execAsync(cmd: string): Promise<string> {
return new Promise((resolve, reject) => {
exec(cmd, (error, stdout) => {
if (error) reject(error);
else resolve(stdout);
});
});
}

async function readBatteryInfo(): Promise<BatteryInfo | null> {
  try {
    const p = await readReg(0x0a);
    const ch = await readReg(0x0b);
    const lo = await readReg(0x0c);
    const hi = await readReg(0x0d);
    return {
      percent: p,
      charging: ch === 1,
      minutes: lo | (hi << 8)
    };
  } catch (e) {
    console.error('i2c read failed', e);
    return null;
  }
}

async function readReg(reg: number): Promise<number> {
  const out = await execAsync(`i2cget -y 1 0x2d 0x${reg.toString(16)}`);
  return parseInt(out, 16);
}

function formatMinutes(mins: number): string {
const h = Math.floor(mins / 60);
const m = mins % 60;
if (h > 0) return `${h}t ${m}m`;
return `${m}m`;
}

async function findBacklight(): Promise<string | null> {
try {
const entries = await fs.readdir('/sys/class/backlight');
if (entries.length === 0) return null;
return path.join('/sys/class/backlight', entries[0]);
} catch (e) {
console.error(e);
return null;
}
}

async function getBrightness(): Promise<number | null> {
const backlight = await findBacklight();
if (!backlight) return null;
try {
const maxStr = await fs.readFile(path.join(backlight, 'max_brightness'), 'utf8');
const curStr = await fs.readFile(path.join(backlight, 'brightness'), 'utf8');
const max = parseInt(maxStr.trim(), 10);
const cur = parseInt(curStr.trim(), 10);
const min = Math.round(max * 0.1);
return Math.round(((cur - min) / (max - min)) * 100);
} catch (e) {
console.error(e);
return null;
}
}
