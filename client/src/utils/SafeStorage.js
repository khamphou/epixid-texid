/**
 * SafeStorage - Secure wrapper around localStorage with validation
 *
 * Prevents crashes from:
 * - Quota exceeded errors
 * - Corrupted/malicious data
 * - Missing keys
 * - Browser security restrictions
 */

export class SafeStorage {
  /**
   * Get value from localStorage with validation
   * @param {string} key - Storage key
   * @param {Function} validator - Validation function (value => boolean)
   * @param {*} defaultValue - Default value if not found or invalid
   * @returns {*} Validated value or default
   */
  static get(key, validator, defaultValue) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return defaultValue;

      // If validator provided, check validity
      if (validator && !validator(raw)) {
        console.warn(`SafeStorage: Invalid value for key "${key}", using default`);
        return defaultValue;
      }

      return raw;
    } catch (err) {
      console.error(`SafeStorage.get error for key "${key}":`, err);
      return defaultValue;
    }
  }

  /**
   * Set value in localStorage with error handling
   * @param {string} key - Storage key
   * @param {string} value - Value to store
   * @returns {boolean} Success status
   */
  static set(key, value) {
    try {
      localStorage.setItem(key, String(value));
      return true;
    } catch (err) {
      console.error(`SafeStorage.set error for key "${key}":`, err);
      // Quota exceeded or other error
      return false;
    }
  }

  /**
   * Remove value from localStorage
   * @param {string} key - Storage key
   * @returns {boolean} Success status
   */
  static remove(key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (err) {
      console.error(`SafeStorage.remove error for key "${key}":`, err);
      return false;
    }
  }

  /**
   * Get integer value with validation
   * @param {string} key - Storage key
   * @param {number} min - Minimum allowed value
   * @param {number} max - Maximum allowed value
   * @param {number} defaultValue - Default value
   * @returns {number} Validated integer or default
   */
  static getInt(key, min, max, defaultValue) {
    return this.get(
      key,
      (value) => {
        const num = parseInt(value, 10);
        return !isNaN(num) && num >= min && num <= max;
      },
      defaultValue
    );
  }

  /**
   * Get value from a predefined list (enum)
   * @param {string} key - Storage key
   * @param {Array} allowedValues - Array of allowed values
   * @param {*} defaultValue - Default value
   * @returns {*} Validated value or default
   */
  static getEnum(key, allowedValues, defaultValue) {
    return this.get(
      key,
      (value) => allowedValues.includes(value),
      defaultValue
    );
  }

  /**
   * Get string value with max length validation
   * @param {string} key - Storage key
   * @param {number} maxLength - Maximum allowed length
   * @param {string} defaultValue - Default value
   * @returns {string} Validated string or default
   */
  static getString(key, maxLength, defaultValue) {
    return this.get(
      key,
      (value) => typeof value === 'string' && value.length <= maxLength,
      defaultValue
    );
  }

  /**
   * Check if localStorage is available
   * @returns {boolean} True if localStorage is available
   */
  static isAvailable() {
    try {
      const test = '__storage_test__';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch {
      return false;
    }
  }
}
