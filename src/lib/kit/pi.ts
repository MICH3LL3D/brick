// Raspberry Pi code for the build kit, generated from templates (never written by Gemini).
// gpiozero for GPIO parts (works on Pi 4B and Pi 5); Adafruit CircuitPython libraries for I2C boards.
import type { Design, Part } from "../contracts";
import type { Derived, Room, SimResult, Task } from "../data";
import { isCamera, isExtendable, isGripper, isPump, resolveParts } from "../derive";

export type KitFile = { path: string; content: string };

/* ---------- Hardware model (from the pin map, so code and wiring.md always agree) ---------- */

type MotorChannel =
  | { kind: "gpio"; forward: number; backward: number; enable?: number }
  | { kind: "phase"; phase: number; enable: number }
  | { kind: "hat"; number: number; address: number };

/** Pin order each driver's GPIO list uses (matches derive.ts handing out pins in this order). */
export const DRIVER_PIN_ROLES: Record<string, string[]> = {
  "md-tb6612": ["AIN1", "AIN2", "PWMA", "BIN1", "BIN2", "PWMB", "STBY"],
  "md-drv8833": ["AIN1", "AIN2", "BIN1", "BIN2"],
  "md-g2-24v14": ["M1PWM", "M1DIR", "M2PWM", "M2DIR", "SLP", "FLT"],
};

const gpioNums = (pins: string[]) => pins.map((p) => /^GPIO(\d+)/.exec(p)?.[1]).filter(Boolean).map(Number);

/** Pin role names for GPIO sensors, in the order derive.ts hands out their pins. */
export function sensorPinRoles(part: Part): string[] {
  return (part.caps.pins ?? 0) >= 2 ? ["TRIG", "ECHO"] : ["OUT"];
}

type Hardware = {
  channels: MotorChannel[];           // physical motor channels, in letter order A, B, C...
  alwaysOn: number[];                 // e.g. TB6612 STBY, G2 SLP
  uses: Record<string, string>;       // consumer -> channel letter, e.g. drive_left -> "A"
  servo: Record<string, number[]>;    // consumer -> PCA9685 channels
  gpio: Record<string, number[]>;     // consumer -> raw GPIO pins (sensors)
  hasAdc: boolean;
};

function hardware(design: Design, derived: Derived, catalog: Part[]): Hardware {
  const r = resolveParts(design, catalog);
  const channels: MotorChannel[] = [];
  const alwaysOn: number[] = [];
  let hatIndex = 0;
  // Match drivers to pin-map rows in order: the same driver can appear twice with different pins.
  const driverRows = derived.pinMap.filter((m) => catalog.find((p) => p.id === m.partId)?.category === "motor_driver");
  for (const [i, d] of r.parts.filter((p) => p.category === "motor_driver").entries()) {
    const pins = gpioNums(driverRows[i]?.pins ?? []);
    const role = (name: string) => pins[(DRIVER_PIN_ROLES[d.id] ?? ["IN1", "IN2", "IN3", "IN4"]).indexOf(name)];
    if (d.caps.interface === "i2c") {
      const address = 0x60 + hatIndex++;
      for (let n = 1; n <= 4; n++) channels.push({ kind: "hat", number: n, address });
    } else if (d.id === "md-g2-24v14") {
      channels.push({ kind: "phase", phase: role("M1DIR"), enable: role("M1PWM") });
      channels.push({ kind: "phase", phase: role("M2DIR"), enable: role("M2PWM") });
      if (role("SLP") !== undefined) alwaysOn.push(role("SLP"));
    } else if (d.id === "md-tb6612") {
      channels.push({ kind: "gpio", forward: role("AIN1"), backward: role("AIN2"), enable: role("PWMA") });
      channels.push({ kind: "gpio", forward: role("BIN1"), backward: role("BIN2"), enable: role("PWMB") });
      if (role("STBY") !== undefined) alwaysOn.push(role("STBY"));
    } else {
      channels.push({ kind: "gpio", forward: pins[0], backward: pins[1] });
      channels.push({ kind: "gpio", forward: pins[2], backward: pins[3] });
    }
  }

  const uses: Record<string, string> = {};
  const servo: Record<string, number[]> = {};
  const gpio: Record<string, number[]> = {};
  for (const m of derived.pinMap) {
    const part = catalog.find((p) => p.id === m.partId);
    if (!part) continue;
    const letters = m.pins.map((p) => /^driver channel ([A-Z])/.exec(p)?.[1]).filter((x): x is string => !!x);
    const pca = m.pins.map((p) => /^PCA9685 ch(\d+)/.exec(p)?.[1]).filter(Boolean).map(Number);
    if (part.category === "chassis") { uses.drive_left = letters[0]; uses.drive_right = letters[1]; }
    else if (isExtendable(part)) uses.arm = letters[0];
    else if (isPump(part) && letters.length) uses.pump = letters[0];
    if (pca.length) {
      if (part.category === "arm") servo.arm = pca;
      else if (isGripper(part)) servo.gripper = pca;
      else if (isPump(part)) servo.pump = pca;
      else if (part.id === "tool-cam-pantilt") servo.pan_tilt = pca;
      else servo[part.id.replace(/-/g, "_")] = pca; // unknown servo part: listed in config, no driver yet
    }
    if (part.category === "sensor" && part.caps.interface === "gpio") {
      // Key by id plus a counter so two identical sensors both keep their pins.
      const base = part.id.replace(/-/g, "_");
      let key = base;
      for (let n = 2; gpio[key]; n++) key = `${base}_${n}`;
      gpio[key] = gpioNums(m.pins);
    }
  }
  return { channels, alwaysOn, uses, servo, gpio, hasAdc: r.parts.some((p) => /ads1115/.test(p.id)) };
}

/* ---------- Python literal helpers ---------- */

const py = (v: unknown): string => {
  if (v === null || v === undefined) return "None";
  if (typeof v === "boolean") return v ? "True" : "False";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(3);
  if (typeof v === "string") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(py).join(", ")}]`;
  return `{${Object.entries(v as Record<string, unknown>).map(([k, x]) => `${JSON.stringify(k)}: ${py(x)}`).join(", ")}}`;
};

/* ---------- Files ---------- */

export function piFiles(design: Design, task: Task, derived: Derived, sim: SimResult, room: Room, catalog: Part[]): KitFile[] {
  const r = resolveParts(design, catalog);
  const hw = hardware(design, derived, catalog);
  const chassis = r.chassis;
  const arm = r.arm;
  const linear = arm && isExtendable(arm);
  const hasCamera = r.parts.some(isCamera);
  const hasGripper = r.parts.some(isGripper) && hw.servo.gripper;
  const hasPump = !!hw.uses.pump || !!hw.servo.pump;
  const hasPanTilt = r.parts.some((p) => p.id === "tool-cam-pantilt") && (hw.servo.pan_tilt?.length ?? 0) > 0;
  const sensors = Object.keys(hw.gpio);

  // One leg per sim event: the sim path between the previous event and this one.
  // Each goto in the routine uses the next unused leg for its target, so repeat visits work.
  const legs: { target: string; points: [number, number][] }[] = [];
  let prevT = 0;
  for (const e of sim.events) {
    legs.push({ target: e.targetId, points: sim.path.filter((p) => p.t > prevT && p.t <= e.t).map((p) => [Math.round(p.x), Math.round(p.y)]) });
    prevT = e.t;
  }
  const usedLegs = new Set<number>();
  const legFor = (target: string): number => {
    const i = legs.findIndex((l, k) => l.target === target && !usedLegs.has(k));
    if (i >= 0) usedLegs.add(i);
    return i;
  };
  const homePath = sim.path.filter((p) => p.t > prevT).map((p) => [Math.round(p.x), Math.round(p.y)]);

  const strokeMm = linear ? Math.max(0, (arm.caps.liftMaxMm ?? 0) - arm.dims.h) : 0;
  const config = `# Generated configuration. Pin numbers use BCM numbering and match wiring.md.
# This code has not been tested on hardware. Test with wheels off the ground first.

TASK = ${py(task.prompt)}

# Motor driver channels, in the same A, B, C... order as wiring.md.
MOTOR_CHANNELS = {
${hw.channels.map((c, i) => `    ${py(String.fromCharCode(65 + i))}: ${py(c)},`).join("\n")}
}
ALWAYS_ON_PINS = ${py(hw.alwaysOn)}  # driver standby / sleep pins held high

DRIVE_LEFT = ${py(hw.uses.drive_left ?? null)}
DRIVE_RIGHT = ${py(hw.uses.drive_right ?? null)}
ARM_CHANNEL = ${py(hw.uses.arm ?? null)}
PUMP_CHANNEL = ${py(hw.uses.pump ?? null)}

# PCA9685 servo channels (I2C address 0x40).
SERVO_CHANNELS = ${py(hw.servo)}

# GPIO sensors: [trigger, echo] for ultrasonic, [out] for digital distance.
SENSOR_PINS = ${py(hw.gpio)}

HAS_ADC = ${py(hw.hasAdc)}  # ADS1115 reads the linear actuator feedback on channel 0
HAS_CAMERA = ${py(hasCamera)}

# Motion, from catalog values. Speeds are fractions of full power.
DRIVE_SPEED = 0.5
INVERT_LEFT = False                   # set True if selftest shows the left side runs backwards
INVERT_RIGHT = False
SAFE_SPEED = 0.25                     # selftest speed
MAX_SPEED_MPS = ${py(chassis?.caps.speedMps ?? 0.3)}  # no-load speed at full power
WHEEL_BASE_MM = ${py(chassis?.dims.w ?? 150)}

ARM_TYPE = ${py(linear ? "linear" : arm ? "servo" : null)}
ARM_STROKE_MM = ${py(strokeMm)}
ARM_SPEED_MM_S = 14.0                 # about 0.57 in/s for the Glideforce actuators
ARM_LIFT_MAX_MM = ${py(arm?.caps.liftMaxMm ?? 0)}

PUMP_ML_PER_S = ${py(r.parts.find(isPump)?.caps.pumpMlPerS ?? 0)}

HOME = ${py([room.home.x, room.home.y])}
LEGS = ${py(legs.map((l) => l.points))}  # one list of [x, y] waypoints per goto, in order
HOME_PATH = ${py(homePath)}
`;

  const motors = `"""Motor channels: gpiozero for GPIO drivers, Adafruit MotorKit for the I2C motor HAT."""
from gpiozero import Motor, PhaseEnableMotor, DigitalOutputDevice

import config

_hats = {}
_always_on = [DigitalOutputDevice(pin, initial_value=True) for pin in config.ALWAYS_ON_PINS]


class Channel:
    """One motor output. value is -1.0 (full reverse) to 1.0 (full forward)."""

    def __init__(self, letter, invert=False):
        spec = config.MOTOR_CHANNELS[letter]
        self.kind = spec["kind"]
        self.sign = -1.0 if invert else 1.0
        if self.kind == "gpio":
            # TB6612: PWM on IN pins with the PWM pin held high works as speed control.
            self.motor = Motor(spec["forward"], spec["backward"], enable=spec.get("enable"), pwm=True)
        elif self.kind == "phase":
            self.motor = PhaseEnableMotor(spec["phase"], spec["enable"], pwm=True)
        else:
            from adafruit_motorkit import MotorKit
            address = spec["address"]
            if address not in _hats:
                _hats[address] = MotorKit(address=address)
            self.motor = getattr(_hats[address], "motor%d" % spec["number"])

    def run(self, value):
        value = max(-1.0, min(1.0, value)) * self.sign
        if self.kind == "hat":
            self.motor.throttle = value
        else:
            self.motor.value = value

    def stop(self):
        self.run(0.0)
`;

  const drive = `"""Differential drive with dead reckoning. No position sensing: expect drift."""
import math
import time

import config
from drivers.motors import Channel


class Drive:
    def __init__(self):
        self.left = Channel(config.DRIVE_LEFT, invert=config.INVERT_LEFT)
        self.right = Channel(config.DRIVE_RIGHT, invert=config.INVERT_RIGHT)
        self.x, self.y = config.HOME
        self.heading = 0.0  # radians, 0 = +x

    def _speed_mm_s(self, power):
        return config.MAX_SPEED_MPS * 1000.0 * power

    def stop(self):
        self.left.stop()
        self.right.stop()

    def forward(self, mm, power=config.DRIVE_SPEED):
        seconds = abs(mm) / max(self._speed_mm_s(power), 1.0)
        direction = 1.0 if mm >= 0 else -1.0
        self.left.run(direction * power)
        self.right.run(direction * power)
        time.sleep(seconds)
        self.stop()
        self.x += math.cos(self.heading) * mm
        self.y += math.sin(self.heading) * mm

    def turn(self, radians, power=config.DRIVE_SPEED):
        arc = abs(radians) * config.WHEEL_BASE_MM / 2.0
        seconds = arc / max(self._speed_mm_s(power), 1.0)
        direction = 1.0 if radians >= 0 else -1.0
        self.left.run(-direction * power)
        self.right.run(direction * power)
        time.sleep(seconds)
        self.stop()
        self.heading += radians

    def go_to(self, x, y):
        dx, dy = x - self.x, y - self.y
        distance = math.hypot(dx, dy)
        if distance < 10:
            return
        target = math.atan2(dy, dx)
        delta = (target - self.heading + math.pi) % (2 * math.pi) - math.pi
        self.turn(delta)
        self.forward(distance)

    def follow(self, points):
        for x, y in points:
            self.go_to(x, y)
`;

  const servoKit = `"""Shared PCA9685 servo board (I2C address 0x40)."""
_kit = None


def kit():
    global _kit
    if _kit is None:
        from adafruit_servokit import ServoKit
        _kit = ServoKit(channels=16)
    return _kit
`;

  const servoArm = `"""Fixed servo arm on the PCA9685. Angles are a starting guess: calibrate before use."""
import time

import config
from drivers.servo_board import kit

# Angles per joint, in servo channel order (base, shoulder, elbow, wrist/claw).
# These are starting guesses. Calibrate each joint alone before running main.py.
REST = [90, 150, 30, 90]
REACH = [90, 90, 90, 90]


class ServoArm:
    def __init__(self):
        self.channels = config.SERVO_CHANNELS.get("arm", [])

    def _set(self, angles):
        for ch, angle in zip(self.channels, angles):
            kit().servo[ch].angle = angle
            time.sleep(0.3)  # one joint at a time so the arm does not fold into itself

    def extend(self, mm=None):
        self._set(REACH)

    def retract(self):
        self._set(REST)

    def stop(self):
        pass  # servos hold their last angle
`;

  const linearArm = `"""Linear actuator lift on a motor channel. Uses ADS1115 feedback if present, else timing."""
import time

import config
from drivers.motors import Channel


class LinearArm:
    def __init__(self):
        self.channel = Channel(config.ARM_CHANNEL)
        self.position_mm = 0.0
        self.adc = None
        if config.HAS_ADC:
            import board
            import busio
            import adafruit_ads1x15.ads1115 as ADS
            from adafruit_ads1x15.analog_in import AnalogIn
            self.adc = AnalogIn(ADS.ADS1115(busio.I2C(board.SCL, board.SDA)), ADS.P0)

    def _read_mm(self):
        # Feedback pot powered from 3.3V: 0 V = retracted, 3.3 V = full stroke.
        return max(0.0, min(1.0, self.adc.voltage / 3.3)) * config.ARM_STROKE_MM

    def move_to(self, mm, power=0.8, timeout_s=30.0):
        mm = max(0.0, min(float(mm), config.ARM_STROKE_MM))
        if self.adc is not None:
            start = time.time()
            last, last_change = self._read_mm(), time.time()
            while time.time() - start < timeout_s:
                now = self._read_mm()
                error = mm - now
                if abs(error) < 3:
                    break
                if abs(now - last) > 1:
                    last, last_change = now, time.time()
                elif time.time() - last_change > 2:
                    # No movement for 2 s: stalled, at its end stop, or the feedback wire is loose.
                    print("arm: feedback not changing, stopping for safety")
                    break
                self.channel.run(power if error > 0 else -power)
                time.sleep(0.02)
            self.channel.stop()
            self.position_mm = self._read_mm()
            return
        delta = mm - self.position_mm
        self.channel.run(power if delta > 0 else -power)
        time.sleep(abs(delta) / (config.ARM_SPEED_MM_S * power))
        self.channel.stop()
        self.position_mm = mm

    def extend(self, mm=None):
        self.move_to(config.ARM_STROKE_MM if mm is None else mm)

    def stop(self):
        self.channel.stop()

    def retract(self):
        self.move_to(0)
`;

  const pump = `"""Water pump: a DC pump on a motor channel, or a servo-controlled pump on the PCA9685."""
import time

import config


class Pump:
    def __init__(self):
        self.channel = None
        self.servo = None
        if config.PUMP_CHANNEL:
            from drivers.motors import Channel
            self.channel = Channel(config.PUMP_CHANNEL)
        elif config.SERVO_CHANNELS.get("pump"):
            from drivers.servo_board import kit
            self.servo = kit().continuous_servo[config.SERVO_CHANNELS["pump"][0]]

    def on(self, power=1.0):
        if self.channel:
            self.channel.run(power)
        elif self.servo is not None:
            self.servo.throttle = power

    def off(self):
        if self.channel:
            self.channel.stop()
        elif self.servo is not None:
            self.servo.throttle = 0

    def run(self, seconds):
        self.on()
        time.sleep(seconds)
        self.off()
`;

  const gripper = `"""Servo gripper on the PCA9685. Calibrate OPEN and CLOSED for your jaws."""
import time

import config
from drivers.servo_board import kit

OPEN = 150
CLOSED = 40


class Gripper:
    def __init__(self):
        self.channel = config.SERVO_CHANNELS["gripper"][0]

    def grip(self):
        kit().servo[self.channel].angle = CLOSED
        time.sleep(0.6)

    def release(self):
        kit().servo[self.channel].angle = OPEN
        time.sleep(0.6)
`;

  const camera = `"""Pi camera via picamera2 (install with: sudo apt install python3-picamera2)."""
import time


class Camera:
    def __init__(self):
        from picamera2 import Picamera2
        self.cam = Picamera2()
        self.cam.configure(self.cam.create_still_configuration())
        self.cam.start()
        time.sleep(1)

    def photo(self, name):
        path = "photo-%s-%d.jpg" % (name, int(time.time()))
        self.cam.capture_file(path)
        return path
`;

  const panTilt = `"""Pan/tilt camera mount: two servos on the PCA9685 (pan first, then tilt).
Angles are offsets in degrees from straight ahead. They are clamped to safe limits so the
mount never drives into its end stops or twists the camera ribbon cable.
"""
import time

import config
from drivers.servo_board import kit

CENTER = 90          # servo angle that points the camera straight ahead
PAN_LIMIT = 60       # degrees left or right of center
TILT_LIMIT = 30      # degrees up or down of center


def _clamp(value, limit):
    return max(-limit, min(limit, float(value)))


class PanTilt:
    def __init__(self):
        channels = config.SERVO_CHANNELS.get("pan_tilt", [])
        self.pan = channels[0] if len(channels) > 0 else None
        self.tilt = channels[1] if len(channels) > 1 else None
        if self.pan is None or self.tilt is None:
            print("pan/tilt: expected 2 servo channels in config.SERVO_CHANNELS['pan_tilt'], got %s" % channels)
        self.angles = {}

    def _move(self, channel, target, step=5):
        # Ramp in small steps so the first move does not snap the mount.
        current = self.angles.get(channel, CENTER)
        while abs(target - current) > step:
            current += step if target > current else -step
            kit().servo[channel].angle = current
            time.sleep(0.02)
        kit().servo[channel].angle = target
        self.angles[channel] = target

    def look(self, pan=0, tilt=0):
        if self.pan is not None:
            self._move(self.pan, CENTER + _clamp(pan, PAN_LIMIT))
        if self.tilt is not None:
            self._move(self.tilt, CENTER + _clamp(tilt, TILT_LIMIT))
        time.sleep(0.4)  # let the camera settle before a photo

    def center(self):
        self.look(0, 0)
`;

  const distance = `"""GPIO distance sensors."""
from gpiozero import DigitalInputDevice, DistanceSensor

import config


def sensors():
    found = {}
    for name, pins in config.SENSOR_PINS.items():
        if len(pins) >= 2:
            found[name] = DistanceSensor(echo=pins[1], trigger=pins[0], max_distance=2)
        elif len(pins) == 1:
            found[name] = DigitalInputDevice(pins[0])
    return found
`;

  // main.py: one call per routine step, in order.
  const stepLines = design.routine.map((s) => {
    const t = s.target ? py(s.target) : "None";
    switch (s.op) {
      case "goto": {
        const leg = s.target ? legFor(s.target) : -1;
        return leg >= 0 ? `    drive.follow(config.LEGS[${leg}])  # goto ${s.target}` : `    pass  # goto ${s.target ?? "(no target)"}: no path from the simulation`;
      }
      case "extend_arm": return arm ? `    arm.extend(${s.value ?? "None"})` : "    pass  # extend_arm: no arm";
      case "retract_arm": return arm ? "    arm.retract()" : "    pass  # retract_arm: no arm";
      case "grip": return hasGripper ? "    gripper.grip()" : "    pass  # grip: no gripper";
      case "release": return hasGripper ? "    gripper.release()" : "    pass  # release: no gripper";
      case "pump_on": return hasPump ? (s.value ? `    pump.run(${s.value})` : "    pump.on()") : "    pass  # pump_on: no pump";
      case "pump_off": return hasPump ? "    pump.off()" : "    pass  # pump_off: no pump";
      case "wait": return `    time.sleep(${s.value ?? 1})`;
      case "photograph": {
        const shot = hasCamera ? `    print("saved", camera.photo(${t === "None" ? '"photo"' : t}))` : "    pass  # photograph: no camera";
        return hasPanTilt ? `    pan_tilt.center()\n    ${shot}` : shot;
      }
      case "return_home": return "    drive.follow(config.HOME_PATH or [config.HOME])";
      default: return `    print(${py(`TODO: custom step ${s.op}${s.target ? ` (target ${s.target})` : ""}`)})  # no generated code for this step; fill it in`;
    }
  });

  const imports = [
    "import time",
    "",
    ...[
      "import config",
      "from drivers.drive import Drive",
      linear ? "from drivers.linear_arm import LinearArm" : arm ? "from drivers.servo_arm import ServoArm" : "",
      hasPump ? "from drivers.pump import Pump" : "",
      hasGripper ? "from drivers.gripper import Gripper" : "",
      hasCamera ? "from drivers.camera import Camera" : "",
      hasPanTilt ? "from drivers.pan_tilt import PanTilt" : "",
      sensors.length ? "from drivers.distance import sensors" : "",
    ].filter(Boolean),
  ];

  const setup = [
    "    drive = Drive()",
    linear ? "    arm = LinearArm()" : arm ? "    arm = ServoArm()" : "",
    hasPump ? "    pump = Pump()" : "",
    hasGripper ? "    gripper = Gripper()" : "",
    hasCamera ? "    camera = Camera()" : "",
    hasPanTilt ? "    pan_tilt = PanTilt()" : "",
  ].filter(Boolean);

  const main = `"""Runs the routine for the task in config.TASK.
Generated from the design. This code has not been tested on hardware.
Test with the wheels off the ground first. Press Ctrl+C to stop.
"""
${imports.join("\n")}


def run():
${setup.join("\n")}
    try:
${stepLines.map((l) => "    " + l).join("\n") || "        pass"}
    finally:
        drive.stop()${arm ? "\n        arm.stop()" : ""}${hasPump ? "\n        pump.off()" : ""}


if __name__ == "__main__":
    run()
`;

  const selftestSteps = [
    `    check("drive left", lambda: spin(drive.left))`,
    `    check("drive right", lambda: spin(drive.right))`,
    linear ? `    check("linear arm", lambda: (arm.move_to(20, power=0.4), arm.move_to(0, power=0.4)))` : "",
    !linear && arm ? `    check("servo arm", lambda: (arm.extend(), arm.retract()))` : "",
    hasPump ? `    check("pump (0.5 s)", lambda: pump.run(0.5))` : "",
    hasGripper ? `    check("gripper", lambda: (gripper.grip(), gripper.release()))` : "",
    hasPanTilt ? `    check("pan/tilt mount", lambda: (pan_tilt.look(-15, 0), pan_tilt.look(15, 0), pan_tilt.look(0, -10), pan_tilt.look(0, 10), pan_tilt.center()))` : "",
    hasCamera ? `    check("camera", lambda: print("   saved", camera.photo("selftest")))` : "",
    sensors.length ? `    check("distance sensors", read_sensors)` : "",
  ].filter(Boolean);

  const selftest = `"""Exercises each part alone at safe, low speeds. Wheels off the ground first!
This code has not been tested on hardware.
"""
${imports.join("\n")}


def spin(channel):
    for value in (config.SAFE_SPEED, -config.SAFE_SPEED):
        channel.run(value)
        time.sleep(0.5)
        channel.stop()
        time.sleep(0.3)

${sensors.length ? `
def read_sensors():
    for name, sensor in sensors().items():
        for _ in range(3):
            reading = getattr(sensor, "distance", None)
            print("   %s: %s" % (name, reading if reading is not None else sensor.value))
            time.sleep(0.2)
` : ""}
def check(name, fn):
    input("Next: %s. Press Enter to run (Ctrl+C to quit)... " % name)
    try:
        fn()
        print("   ok")
    except Exception as error:  # report and keep going so every part gets tested
        print("   FAILED: %s" % error)


def run():
${setup.join("\n")}
${selftestSteps.join("\n")}
    drive.stop()
    print("Self-test finished.")


if __name__ == "__main__":
    run()
`;

  const needs = (s: string) => r.parts.some((p) => p.caps.interface === "i2c" && new RegExp(s).test(p.id));
  const requirements = [
    "gpiozero>=2.0",
    "lgpio  # gpiozero pin backend that works on Pi 5",
    needs("motor-hat") ? "adafruit-circuitpython-motorkit" : "",
    r.parts.some((p) => /pca9685/.test(p.id)) ? "adafruit-circuitpython-servokit" : "",
    hw.hasAdc ? "adafruit-circuitpython-ads1x15" : "",
    hasCamera ? "# picamera2: install with apt (sudo apt install python3-picamera2), not pip" : "",
  ].filter(Boolean).join("\n") + "\n";

  const files: KitFile[] = [
    { path: "pi/config.py", content: config },
    { path: "pi/drivers/__init__.py", content: "" },
    { path: "pi/drivers/motors.py", content: motors },
    { path: "pi/drivers/drive.py", content: drive },
    { path: "pi/main.py", content: main },
    { path: "pi/selftest.py", content: selftest },
    { path: "pi/requirements.txt", content: requirements },
  ];
  if (Object.keys(hw.servo).length) files.push({ path: "pi/drivers/servo_board.py", content: servoKit });
  if (arm && !linear) files.push({ path: "pi/drivers/servo_arm.py", content: servoArm });
  if (linear) files.push({ path: "pi/drivers/linear_arm.py", content: linearArm });
  if (hasPump) files.push({ path: "pi/drivers/pump.py", content: pump });
  if (hasGripper) files.push({ path: "pi/drivers/gripper.py", content: gripper });
  if (hasCamera) files.push({ path: "pi/drivers/camera.py", content: camera });
  if (hasPanTilt) files.push({ path: "pi/drivers/pan_tilt.py", content: panTilt });
  if (sensors.length) files.push({ path: "pi/drivers/distance.py", content: distance });
  return files;
}
