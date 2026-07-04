import {
  RESTAURANT_ACCOUNTS_KEY,
  REGISTERED_RESTAURANTS_KEY,
  RESTAURANT_SESSION_KEY,
  CLIENT_SESSION_KEY,
  SEED_STORAGE_KEY,
  SAVE_QUEUE_KEY,
} from "./constants.js";

export function readJsonStorage(key, defaultValue) {
  if (typeof window === "undefined") return defaultValue;
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(defaultValue));
  } catch {
    return defaultValue;
  }
}

export function writeJsonStorage(key, value) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}

export function readAccounts() {
  return readJsonStorage(RESTAURANT_ACCOUNTS_KEY, []);
}

export function writeAccounts(accounts) {
  writeJsonStorage(RESTAURANT_ACCOUNTS_KEY, accounts);
}

export function readRegisteredRestaurants() {
  return readJsonStorage(REGISTERED_RESTAURANTS_KEY, []);
}

export function writeRegisteredRestaurants(restaurants) {
  writeJsonStorage(REGISTERED_RESTAURANTS_KEY, restaurants);
}

export function readRestaurantSession() {
  return readJsonStorage(RESTAURANT_SESSION_KEY, null);
}

export function writeRestaurantSession(session) {
  writeJsonStorage(RESTAURANT_SESSION_KEY, session);
}

export function readClientSession() {
  return readJsonStorage(CLIENT_SESSION_KEY, null);
}

export function writeClientSession(session) {
  writeJsonStorage(CLIENT_SESSION_KEY, session);
}

export function readSeedStorage() {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(SEED_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

export function writeSeedStorage(seed) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SEED_STORAGE_KEY, JSON.stringify(seed));
}

export function readSaveQueue() {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(SAVE_QUEUE_KEY) || "[]");
  } catch {
    return [];
  }
}

export function writeSaveQueue(q) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SAVE_QUEUE_KEY, JSON.stringify(q));
}

export function enqueueSaveItem(item) {
  const q = readSaveQueue();
  q.push(item);
  writeSaveQueue(q);
}

export function removeSaveItemAt(index) {
  const q = readSaveQueue();
  if (index < 0 || index >= q.length) return;
  q.splice(index, 1);
  writeSaveQueue(q);
}
