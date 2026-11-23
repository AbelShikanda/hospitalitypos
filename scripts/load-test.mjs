const base = (process.env.BASE_URL ?? "http://localhost:4000").replace(/\/$/, "");
const clients = Number(process.env.CLIENTS ?? 10);
const pin = process.env.DEMO_PIN ?? "1234";

async function json(path, init = {}) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    credentials: "same-origin",
  });
  if (!response.ok) {
    throw new Error(`${path} failed: ${response.status}`);
  }
  return response.json();
}

const bootstrap = await json("/api/bootstrap");
const staff = bootstrap.staff?.[0];
const venue = bootstrap.venues?.[0];
if (!staff || !venue) throw new Error("No demo staff or venue found");

const login = await fetch(`${base}/api/auth/pin`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    tenant_id: bootstrap.tenant.id,
    user_id: staff.id,
    pin,
  }),
});
if (!login.ok) throw new Error(`PIN login failed: ${login.status}`);
const setCookie = login.headers.get("set-cookie") ?? "";
const cookie = setCookie.split(";")[0] ?? "";

const menu = await json(`/api/menu?venue_id=${venue.id}`, {
  headers: { cookie },
});
const item = menu.categories.flatMap((category) => category.items).find(
  (entry) => entry.is_available && entry.modifier_groups.length === 0,
) ?? menu.categories.flatMap((category) => category.items).find(
  (entry) => entry.is_available,
);
if (!item) throw new Error("No available menu item found");

const modifierIds = item.modifier_groups
  .filter((group) => group.min_select > 0)
  .map((group) => group.modifiers[0]?.id)
  .filter(Boolean);

const started = Date.now();
const results = await Promise.all(
  Array.from({ length: clients }, () =>
    fetch(`${base}/api/orders`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        venue_id: venue.id,
        items: [
          {
            item_id: item.id,
            quantity: 1,
            modifier_ids: modifierIds,
          },
        ],
      }),
    }),
  ),
);
const elapsed = Date.now() - started;
const failed = results.filter((result) => !result.ok);
console.log(
  `[load] ${clients} concurrent orders in ${elapsed}ms, ${failed.length} failed`,
);
if (failed.length) {
  console.error(
    `[load] statuses: ${failed.map((result) => result.status).join(",")}`,
  );
  process.exitCode = 1;
}
