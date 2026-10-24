// Raspberry Pi 40-pin header: BCM (GPIO) number -> physical pin. Used to draw wires to the right pad.
export const BOARD_PIN: Record<number, number> = {
  2: 3, 3: 5, 4: 7, 14: 8, 15: 10, 17: 11, 18: 12, 27: 13, 22: 15, 23: 16, 24: 18, 10: 19, 9: 21,
  25: 22, 11: 23, 8: 24, 7: 26, 5: 29, 6: 31, 12: 32, 13: 33, 19: 35, 16: 36, 26: 37, 20: 38, 21: 40,
};

/** Non-GPIO pins of the header, by physical pin. */
export const FIXED_PINS: Record<number, string> = {
  1: "3V3", 17: "3V3", 2: "5V", 4: "5V",
  6: "GND", 9: "GND", 14: "GND", 20: "GND", 25: "GND", 30: "GND", 34: "GND", 39: "GND",
};

/** "GPIO17" or "GPIO2 (SDA)" -> physical pin 11, or undefined when it is not a header GPIO. */
export function boardPinOf(label: string): number | undefined {
  const bcm = /GPIO(\d+)/.exec(label)?.[1];
  return bcm === undefined ? undefined : BOARD_PIN[Number(bcm)];
}
