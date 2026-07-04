import { API_BASE_URL } from "./constants.js";
import { requestJson } from "./api.js";
import { readSeedStorage, writeSeedStorage } from "./storage.js";
import { normalizeRestaurantLayout } from "./layout.js";

export async function fetchBusiness(businessId) {
  try {
    return await requestJson(`${API_BASE_URL}/v1/businesses/${businessId}`);
  } catch (err) {
    if (err?.status === 404 || err?.payload?.code === "NOT_FOUND") {
      return null;
    }
    throw err;
  }
}

export async function ensureBackendSeed(restaurant) {
  const seed = readSeedStorage();
  const existing = seed[restaurant.id];

  const validateExistingSeed = async (candidate) => {
    if (!candidate?.businessId) return null;
    const existingBusiness = await fetchBusiness(candidate.businessId);
    if (existingBusiness) {
      return {
        businessId: candidate.businessId,
        resourceId: candidate.resourceId,
      };
    }
    return null;
  };

  const validatedExisting = await validateExistingSeed(existing);
  if (validatedExisting) {
    return validatedExisting;
  }

  const validatedBackendIds = await validateExistingSeed({ businessId: restaurant.backendBusinessId, resourceId: restaurant.backendResourceId });
  if (validatedBackendIds) {
    const saved = { businessId: restaurant.backendBusinessId, resourceId: restaurant.backendResourceId };
    writeSeedStorage({ ...seed, [restaurant.id]: saved });
    return saved;
  }

  if (existing) {
    delete seed[restaurant.id];
    writeSeedStorage(seed);
  }

  // Try to create business + resource with simple retry logic for transient errors
  let business = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      business = await requestJson(`${API_BASE_URL}/v1/businesses`, {
        method: "POST",
        body: JSON.stringify({
          name: restaurant.name,
          type: "RESTAURANT",
          cuisine: restaurant.cuisine,
          address: restaurant.address,
          phone: restaurant.phone,
          description: restaurant.description,
          tableLayoutJson: restaurant.tables.length || (restaurant.layoutElements || []).length
            ? JSON.stringify({ tables: restaurant.tables, layoutElements: restaurant.layoutElements || [] })
            : null,
        }),
      });
      break;
    } catch (err) {
      console.warn(`create business attempt ${attempt} failed:`, err);
      if (attempt === 3) throw err;
      await new Promise(r => setTimeout(r, attempt * 300));
    }
  }

  let resource = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      resource = await requestJson(`${API_BASE_URL}/v1/businesses/${business.id}/resources`, {
        method: "POST",
        body: JSON.stringify({
          businessId: business.id,
          name: `${restaurant.name} mesa`,
          capacity: Math.max(...restaurant.tables.map((table) => table.seats), 2),
        }),
      });
      break;
    } catch (err) {
      console.warn(`create resource attempt ${attempt} failed:`, err);
      if (attempt === 3) {
        const nextSeedPartial = { ...seed, [restaurant.id]: { businessId: business.id } };
        writeSeedStorage(nextSeedPartial);
        return nextSeedPartial[restaurant.id];
      }
      await new Promise(r => setTimeout(r, attempt * 300));
    }
  }

  const nextSeed = { ...seed, [restaurant.id]: { businessId: business.id, resourceId: resource?.id } };
  writeSeedStorage(nextSeed);
  return nextSeed[restaurant.id];
}

export async function loadBusinessProfile(restaurant) {
  const businessId = restaurant.backendBusinessId || restaurant.businessId;
  if (!businessId) return restaurant;

  try {
    const backend = await requestJson(`${API_BASE_URL}/v1/businesses/${businessId}`);
    let tables = restaurant.tables;
    let layoutElements = restaurant.layoutElements || [];
    if (backend.tableLayoutJson) {
      try {
        const parsed = JSON.parse(backend.tableLayoutJson);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          tables = parsed.tables || restaurant.tables;
          layoutElements = parsed.layoutElements || restaurant.layoutElements || [];
        } else {
          tables = parsed || restaurant.tables;
        }
      } catch {
        tables = restaurant.tables;
      }
    }
    return {
      ...restaurant,
      backendBusinessId: backend.id,
      backendResourceId: restaurant.backendResourceId || restaurant.resourceId,
      name: backend.name || restaurant.name,
      cuisine: backend.cuisine || restaurant.cuisine,
      address: backend.address || restaurant.address,
      phone: backend.phone || restaurant.phone,
      description: backend.description || restaurant.description,
      tables,
      layoutElements,
    };
  } catch {
    return restaurant;
  }
}

export async function persistRestaurantProfile(restaurant) {
  const backend = await ensureBackendSeed(restaurant);
  let businessId = backend.businessId || restaurant.backendBusinessId || restaurant.businessId;
  if (!businessId) {
    throw new Error("El restaurante no tiene businessId para persistir en el backend");
  }

  // Retry PUT for transient failures
  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await requestJson(`${API_BASE_URL}/v1/businesses/${businessId}`, {
        method: "PUT",
        body: JSON.stringify({
          name: restaurant.name,
          type: "RESTAURANT",
          cuisine: restaurant.cuisine,
          address: restaurant.address,
          phone: restaurant.phone,
          description: restaurant.description,
          tableLayoutJson: JSON.stringify({ tables: restaurant.tables, layoutElements: restaurant.layoutElements || [] }),
        }),
      });
    } catch (err) {
      lastErr = err;
      console.warn(`persist attempt ${attempt} failed:`, err);

      // If backend reports that the Business id does not exist, clear local seed
      // for this restaurant and force re-seeding (create business + resource),
      // then retry the PUT with the new id.
      const notFound = err?.status === 404 || err?.payload?.code === "NOT_FOUND";
      if (notFound) {
        try {
          const seed = readSeedStorage();
          if (seed[restaurant.id]) {
            delete seed[restaurant.id];
            writeSeedStorage(seed);
            console.info("Seed cleared for restaurant", restaurant.id, "due to NOT_FOUND; will re-seed and retry");
          }
        } catch (e) {
          console.warn("Failed to clear seed storage:", e);
        }

        try {
          // Recreate business/resource and update businessId for the next attempt
          const recreated = await ensureBackendSeed(restaurant);
          businessId = recreated.businessId || restaurant.backendBusinessId || restaurant.businessId;
          await new Promise(r => setTimeout(r, 200));
          continue;
        } catch (reseedErr) {
          console.warn("Re-seeding failed:", reseedErr);
        }
      }

      if (attempt === 3) throw lastErr;
      await new Promise(r => setTimeout(r, attempt * 300));
    }
  }
}

export async function mapRestaurantToBackend(restaurant) {
  const backend = await ensureBackendSeed(restaurant);
  const normalized = normalizeRestaurantLayout(restaurant);
  const mapped = {
    ...normalized,
    backendBusinessId: backend.businessId,
    backendResourceId: backend.resourceId,
    tables: normalized.tables.map((table, index) => ({
      ...table,
      resourceId: backend.resourceId,
      x: table.x || 80 + index * 70,
      y: table.y || 90 + (index % 3) * 70,
    })),
  };
  return loadBusinessProfile(mapped);
}

export function buildIsoDateTime(date, time) {
  const [hour, minute] = time.split(":").map(Number);
  const base = new Date(`${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`);
  return base.toISOString();
}

export function getEndTimeFromStart(startIso, hours = 2) {
  const end = new Date(startIso);
  end.setHours(end.getHours() + hours);
  return end.toISOString();
}
