# Security Specification & Payload TDD

## 1. Data Invariants
1. **Strict Admin Isolation**: Only authorized HQ administrators listed in `/admins/{uid}` (or verified `xuxut58@gmail.com`) may read/write `/settings/*`, `/factoryPrices/*`, or create/modify/delete `/factories/*` and `/grades/*`.
2. **One-Time Atomic Admin Bootstrap Lock**: `/admins/{uid}` can only be self-created once when `/publicMeta/setup` does not yet exist, using `existsAfter(/databases/$(database)/documents/publicMeta/setup)` in the same atomic batch. Once `/publicMeta/setup` is created, it is immutable (`update/delete: false`) and self-registration of admins is permanently blocked; only an already-authenticated admin (`isAdmin()`) may add secondary HQ admins.
3. **Factory Ownership & Active Gate**: A factory user may only read or write `/inventory/{inventoryId}` and `/inventoryLogs/{logId}` belonging to their own active `/factories/{factoryId}` document (`isActive == true`).
4. **Price Confidentiality & Activity Log Isolation**: Unit prices are stored exclusively in `/factoryPrices/*` (never in `/grades/*`), and `/factoryPrices/*` as well as `/activityLogs/*` deny all factory reads (`get`/`list` restricted to `isAdmin()`).
5. **Immutable Audit Trail**: `/activityLogs/*` is append-only (`allow update: if false`), and factories may only create `login` or `inventory_update` logs for their own active `/factories/{factoryId}` (never `price_change` or `actorRole: 'admin'`).
6. **Temporal & Structural Integrity**: All `createdAt` / `updatedAt` timestamps must match `request.time`; all IDs match `^[A-Za-z0-9_-]+$`; all strings enforce bounded `.size()`; all numeric weights/prices are bounded `[0, 10000000]`.
7. **No Shadow Fields or Self-Privilege Escalation**: Every `create` checks both `keys().hasAll(...)` and `keys().hasOnly(...)`; every `update` validates `isValidEntity(incoming())` and `affectedKeys().hasOnly(...)`.

## 2. Adversarial Payloads ("Dirty Dozen")
1. Unauthenticated read on `/factories` -> DENIED.
2. Factory A reading Factory B's `/inventory/{factoryB_A1}` -> DENIED.
3. Factory A listing `/inventory` without matching `factoryOwnerUid`/`factoryAuthorizedEmail` -> DENIED.
4. Factory A writing `/inventory/{factoryB_A1}` -> DENIED.
5. Factory user reading `/factoryPrices/*` or `/activityLogs/*` -> DENIED.
6. Factory user creating an `/activityLogs/*` entry with `eventType: 'price_change'` or `actorRole: 'admin'` -> DENIED.
7. Any user creating a document in `/admins/{uid}` after `/publicMeta/setup` exists -> DENIED.
8. Attacker attempting to overwrite or delete `/publicMeta/setup` -> DENIED.
9. Factory user updating `/factories/{factoryA}` to set `isActive: true` or change `ownerUid` -> DENIED.
10. Client sending a shadow field `isAdmin: true` in `/inventory` -> DENIED (`keys().hasOnly`).
11. Client forging `updatedAt` or `createdAt` timestamp in the past -> DENIED (`== request.time`).
12. Disabled factory (`isActive: false`) attempting to write `/inventory` or `/activityLogs` -> DENIED (Master Gate `get()` check).
