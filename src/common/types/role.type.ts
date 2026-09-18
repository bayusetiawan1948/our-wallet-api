export type HouseholdMemberRole = 'admin' | 'member';

/**
 * Null berarti user belum tergabung ke household mana pun
 * (window antara register dan create/join household).
 */
export type NullableHouseholdMemberRole = HouseholdMemberRole | null;
