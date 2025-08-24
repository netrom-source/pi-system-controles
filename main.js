"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const obsidian_1 = require("obsidian");
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const path = __importStar(require("path"));
const DEFAULT_SETTINGS = {
    useSudo: false
};
class PiSystemControlsPlugin extends obsidian_1.Plugin {
    constructor() {
        super(...arguments);
        this.settings = DEFAULT_SETTINGS;
        this.menuEl = null;
        this.backlightPath = null;
        this.handleDocClick = (evt) => {
            if (this.menuEl && !this.menuEl.contains(evt.target) && !this.gearEl.contains(evt.target)) {
                this.hideMenu();
            }
        };
        this.handleKeyDown = (evt) => {
            if (evt.key === 'Escape')
                this.hideMenu();
        };
    }
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
    async refreshBattery() {
        const info = await readBatteryInfo();
        if (!info) {
            this.statusEl.setText('-- % (ukendt)');
            return;
        }
        const time = formatMinutes(info.minutes);
        if (info.charging) {
            this.statusEl.setText(`${info.percent} % (${time} til fuld opladning)`);
        }
        else {
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
        getRfkillState('wifi').then(state => { if (state != null)
            wifiInput.checked = state; });
        // Bluetooth toggle
        const btRow = this.menuEl.createDiv({ cls: 'pi-row' });
        btRow.createSpan({ text: 'Bluetooth' });
        const btInput = btRow.createEl('input', { type: 'checkbox' });
        btInput.onchange = async () => {
            await this.setRfkill('bluetooth', btInput.checked);
        };
        getRfkillState('bluetooth').then(state => { if (state != null)
            btInput.checked = state; });
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
        getBrightness().then(v => { if (v != null)
            brInput.value = v.toString(); });
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
        if (!this.menuEl)
            return;
        if (this.menuEl.hasClass('hidden')) {
            this.menuEl.removeClass('hidden');
        }
        else {
            this.menuEl.addClass('hidden');
        }
    }
    hideMenu() { this.menuEl?.addClass('hidden'); }
    async toggleWifi() {
        const state = await getRfkillState('wifi');
        if (state != null)
            await this.setRfkill('wifi', !state);
    }
    async toggleBluetooth() {
        const state = await getRfkillState('bluetooth');
        if (state != null)
            await this.setRfkill('bluetooth', !state);
    }
    async adjustBrightness(delta) {
        const current = await getBrightness();
        if (current == null)
            return;
        const next = Math.min(100, Math.max(10, current + delta));
        await this.setBrightness(next);
    }
    async setBrightness(percent) {
        if (!this.backlightPath) {
            this.backlightPath = await findBacklight();
            if (!this.backlightPath) {
                new obsidian_1.Notice('Ingen baggrundslys-enhed');
                return;
            }
        }
        const maxStr = await fs_1.promises.readFile(path.join(this.backlightPath, 'max_brightness'), 'utf8');
        const max = parseInt(maxStr.trim(), 10);
        const min = Math.round(max * 0.1);
        const value = Math.round((percent / 100) * (max - min) + min);
        await fs_1.promises.writeFile(path.join(this.backlightPath, 'brightness'), value.toString());
    }
    async setRfkill(target, on) {
        const action = on ? 'unblock' : 'block';
        await execAsync(`rfkill ${action} ${target}`);
    }
    runCmd(cmd) {
        const full = this.settings.useSudo ? `sudo ${cmd}` : cmd;
        (0, child_process_1.exec)(full);
    }
}
exports.default = PiSystemControlsPlugin;
class PiSystemControlsSettingTab extends obsidian_1.PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }
    display() {
        const { containerEl } = this;
        containerEl.empty();
        new obsidian_1.Setting(containerEl)
            .setName('Use sudo for power commands')
            .addToggle(t => t.setValue(this.plugin.settings.useSudo)
            .onChange(async (value) => {
            this.plugin.settings.useSudo = value;
            await this.plugin.saveSettings();
        }));
    }
}
async function getRfkillState(target) {
    try {
        const out = await execAsync(`rfkill list ${target}`);
        return !/Soft blocked: yes/.test(out);
    }
    catch (e) {
        console.error(e);
        return null;
    }
}
async function execAsync(cmd) {
    return new Promise((resolve, reject) => {
        (0, child_process_1.exec)(cmd, (error, stdout) => {
            if (error)
                reject(error);
            else
                resolve(stdout);
        });
    });
}
async function readBatteryInfo() {
    try {
        const percentHex = await execAsync('i2cget -y 1 0x2d 0x0a');
        const chargingHex = await execAsync('i2cget -y 1 0x2d 0x0b');
        const minsLoHex = await execAsync('i2cget -y 1 0x2d 0x0c');
        const minsHiHex = await execAsync('i2cget -y 1 0x2d 0x0d');
        const percent = parseInt(percentHex, 16);
        const charging = parseInt(chargingHex, 16) === 1;
        const minutes = parseInt(minsLoHex, 16) | (parseInt(minsHiHex, 16) << 8);
        return { percent, charging, minutes };
    }
    catch (e) {
        console.error('i2cget failed', e);
        return null;
    }
}
function formatMinutes(mins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h > 0)
        return `${h}t ${m}m`;
    return `${m}m`;
}
async function findBacklight() {
    try {
        const entries = await fs_1.promises.readdir('/sys/class/backlight');
        if (entries.length === 0)
            return null;
        return path.join('/sys/class/backlight', entries[0]);
    }
    catch (e) {
        console.error(e);
        return null;
    }
}
async function getBrightness() {
    const backlight = await findBacklight();
    if (!backlight)
        return null;
    try {
        const maxStr = await fs_1.promises.readFile(path.join(backlight, 'max_brightness'), 'utf8');
        const curStr = await fs_1.promises.readFile(path.join(backlight, 'brightness'), 'utf8');
        const max = parseInt(maxStr.trim(), 10);
        const cur = parseInt(curStr.trim(), 10);
        const min = Math.round(max * 0.1);
        return Math.round(((cur - min) / (max - min)) * 100);
    }
    catch (e) {
        console.error(e);
        return null;
    }
}
