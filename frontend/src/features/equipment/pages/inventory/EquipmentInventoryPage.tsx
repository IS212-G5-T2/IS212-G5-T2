/**
 * SPM-113: inventory management and event-window availability are separate
 * workflows. This compatibility export keeps the established CRUD component
 * and its SPM-111/SPM-118/SPM-119 tests together while routing it as inventory.
 */
export { EquipmentAvailabilityPage as EquipmentInventoryPage } from "../availability/EquipmentAvailabilityPage";
