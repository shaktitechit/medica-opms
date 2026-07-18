/**
 * Side-effect imports: register all RTK Query endpoints on `medicaApi`
 * before `store.ts` reads `medicaApi.reducer`.
 */
import "./slices/activityApi";
import "./slices/approvalsApi";
import "./slices/attachmentsApi";
import "./slices/authApi";
import "./slices/partiesApi";
import "./slices/dashboardApi";
import "./slices/dispatchApi";
import "./slices/driversApi";
import "./slices/transportAgentsApi";
import "./slices/financeApi";
import "./slices/flagsApi";
import "./slices/notificationsApi";
import "./slices/messagesApi";
import "./slices/communicationApi";
import "./slices/pushApi";
import "./slices/remindersApi";
import "./slices/ordersApi";
import "./slices/orderApprovalApi";
import "./slices/productsApi";
import "./slices/productGroupsApi";
import "./slices/productSubgroupsApi";
import "./slices/productBrandsApi";
import "./slices/productManufacturersApi";
import "./slices/transportApi";
import "./slices/usersApi";
import "./slices/vehiclesApi";
