import { createAdminClient } from "@/lib/supabase/admin";

export type Service = {
  id: string;
  name: string;
  durationMinutes: number;
  price: number;
  isActive: boolean;
  sortOrder: number;
};

/** Fallback when DB has no active job types. */
export const DEFAULT_SERVICES: Omit<Service, "id">[] = [
  { name: "נזילה", durationMinutes: 60, price: 0, isActive: true, sortOrder: 0 },
  { name: "סתימה", durationMinutes: 60, price: 0, isActive: true, sortOrder: 1 },
  {
    name: "התקנת ברז",
    durationMinutes: 90,
    price: 0,
    isActive: true,
    sortOrder: 2,
  },
  { name: "אחר", durationMinutes: 60, price: 0, isActive: true, sortOrder: 3 },
];

type ServiceRow = {
  id: string;
  name: string;
  duration_minutes: number;
  price: number;
  is_active: boolean;
  sort_order: number;
};

function mapRow(row: ServiceRow): Service {
  return {
    id: row.id,
    name: row.name,
    durationMinutes: row.duration_minutes,
    price: Number(row.price),
    isActive: row.is_active,
    sortOrder: row.sort_order,
  };
}

function fallbackServices(): Service[] {
  return DEFAULT_SERVICES.map((service, index) => ({
    ...service,
    id: `fallback-${index}`,
  }));
}

export async function listServices(options: { activeOnly?: boolean } = {}) {
  const supabase = createAdminClient();
  let query = supabase
    .from("services")
    .select("id, name, duration_minutes, price, is_active, sort_order")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (options.activeOnly) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to list services: ${error.message}`);
  }

  return (data ?? []).map(mapRow);
}

/** Active job types for AI; falls back to defaults if none. */
export async function listActiveServices(): Promise<Service[]> {
  const services = await listServices({ activeOnly: true });
  return services.length > 0 ? services : fallbackServices();
}

export function resolveServiceFromList(
  services: Service[],
  serviceName?: string,
): Service {
  const list = services.length > 0 ? services : fallbackServices();
  if (!serviceName?.trim()) {
    return list[0];
  }

  const trimmed = serviceName.trim();
  const exact = list.find((service) => service.name === trimmed);
  if (exact) return exact;

  // Prefer longer names first so "תספורת + זקן" wins over "תספורת".
  const sorted = [...list].sort(
    (a, b) => b.name.length - a.name.length,
  );
  const fuzzy = sorted.find(
    (service) =>
      trimmed.includes(service.name) || service.name.includes(trimmed),
  );
  return fuzzy ?? list[0];
}

export async function resolveService(serviceName?: string): Promise<Service> {
  const services = await listActiveServices();
  return resolveServiceFromList(services, serviceName);
}

function validateFields(input: {
  name?: string;
  durationMinutes?: number;
  price?: number;
}) {
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) {
      throw new Error("name is required");
    }
  }
  if (input.durationMinutes !== undefined) {
    if (
      !Number.isFinite(input.durationMinutes) ||
      !Number.isInteger(input.durationMinutes) ||
      input.durationMinutes <= 0
    ) {
      throw new Error("durationMinutes must be a positive integer");
    }
  }
  if (input.price !== undefined) {
    if (!Number.isFinite(input.price) || input.price < 0) {
      throw new Error("price must be a non-negative number");
    }
  }
}

export async function createService(input: {
  name: string;
  durationMinutes: number;
  price: number;
  sortOrder?: number;
}) {
  validateFields(input);
  const name = input.name.trim();
  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("services")
    .select("id")
    .eq("name", name)
    .eq("is_active", true)
    .maybeSingle();

  if (existing) {
    throw new Error("An active service with this name already exists");
  }

  const { data, error } = await supabase
    .from("services")
    .insert({
      name,
      duration_minutes: input.durationMinutes,
      price: input.price,
      sort_order: input.sortOrder ?? 0,
      is_active: true,
    })
    .select("id, name, duration_minutes, price, is_active, sort_order")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create service");
  }

  return mapRow(data);
}

export async function updateService(
  id: string,
  patch: {
    name?: string;
    durationMinutes?: number;
    price?: number;
    isActive?: boolean;
    sortOrder?: number;
  },
) {
  validateFields(patch);
  const supabase = createAdminClient();

  const next: {
    name?: string;
    duration_minutes?: number;
    price?: number;
    is_active?: boolean;
    sort_order?: number;
    updated_at: string;
  } = { updated_at: new Date().toISOString() };

  if (patch.name !== undefined) {
    next.name = patch.name.trim();
  }
  if (patch.durationMinutes !== undefined) {
    next.duration_minutes = patch.durationMinutes;
  }
  if (patch.price !== undefined) {
    next.price = patch.price;
  }
  if (patch.isActive !== undefined) {
    next.is_active = patch.isActive;
  }
  if (patch.sortOrder !== undefined) {
    next.sort_order = patch.sortOrder;
  }

  if (next.name !== undefined && next.is_active !== false) {
    const { data: existing } = await supabase
      .from("services")
      .select("id")
      .eq("name", next.name)
      .eq("is_active", true)
      .neq("id", id)
      .maybeSingle();

    if (existing) {
      throw new Error("An active service with this name already exists");
    }
  }

  // Reactivating: check name uniqueness against other active rows.
  if (patch.isActive === true) {
    const { data: current } = await supabase
      .from("services")
      .select("name")
      .eq("id", id)
      .maybeSingle();

    const nameToCheck = next.name ?? current?.name;
    if (nameToCheck) {
      const { data: conflict } = await supabase
        .from("services")
        .select("id")
        .eq("name", nameToCheck)
        .eq("is_active", true)
        .neq("id", id)
        .maybeSingle();

      if (conflict) {
        throw new Error("An active service with this name already exists");
      }
    }
  }

  const { data, error } = await supabase
    .from("services")
    .update(next)
    .eq("id", id)
    .select("id, name, duration_minutes, price, is_active, sort_order")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw new Error("Service not found");
  }

  return mapRow(data);
}

export async function deactivateService(id: string) {
  return updateService(id, { isActive: false });
}

export async function deleteService(id: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("services")
    .delete()
    .eq("id", id)
    .select("id, name, duration_minutes, price, is_active, sort_order")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw new Error("Service not found");
  }

  return mapRow(data);
}
