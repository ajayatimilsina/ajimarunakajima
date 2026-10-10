import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInAnonymously, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import { getDatabase, onValue, push, ref, runTransaction, set, update } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyAk81HxCeRB3IGekGcsE9OVHmi1sFdLwYM",
  authDomain: "ajimaru-bcbef.firebaseapp.com",
  databaseURL: "https://ajimaru-bcbef-default-rtdb.firebaseio.com",
  projectId: "ajimaru-bcbef",
  storageBucket: "ajimaru-bcbef.firebasestorage.app",
  messagingSenderId: "893250502168",
  appId: "1:893250502168:web:76740b65a9ca60953fcd6d"
};
const STAFF_EMAIL = "ajayatimilsina1@gmail.com";
const CUSTOMER_ORDER_KEYS = "ajimaru-customer-order-keys";
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getDatabase(app);
const customerOrders = new Map();
const customerListeners = new Set();
const customerOrderStops = new Map();
let staffOrdersStop = null;

function emit(name, detail) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

function isStaff(user) {
  return Boolean(user && !user.isAnonymous && user.email?.toLowerCase() === STAFF_EMAIL);
}

function normalizeOrder(order, key) {
  const items = Array.isArray(order.items) ? order.items : Object.values(order.items || {});
  return { ...order, items, key };
}

function readCustomerKeys() {
  try {
    const keys = JSON.parse(localStorage.getItem(CUSTOMER_ORDER_KEYS) || "[]");
    return Array.isArray(keys) ? keys.filter(key => typeof key === "string") : [];
  } catch (error) {
    throw new Error(`この端末の注文履歴を読み込めませんでした: ${error.message}`);
  }
}

function saveCustomerKey(key) {
  const keys = readCustomerKeys();
  if (!keys.includes(key)) {
    keys.push(key);
    try {
      localStorage.setItem(CUSTOMER_ORDER_KEYS, JSON.stringify(keys));
    } catch (error) {
      emit("firebase-sync-error", { message: `注文は送信されましたが、この端末に注文履歴を保存できませんでした: ${error.message}` });
    }
  }
}

function publishCustomerOrders() {
  const orders = [...customerOrders.values()].sort((first, second) => Number(first.t) - Number(second.t));
  customerListeners.forEach(listener => listener(orders));
}

function watchCustomerOrder(key, uid) {
  if (customerOrderStops.has(key)) return;
  const stop = onValue(ref(database, `orders/${key}`), snapshot => {
    const order = snapshot.val();
    if (order && order.customerUid === uid) customerOrders.set(key, normalizeOrder(order, key));
    else customerOrders.delete(key);
    publishCustomerOrders();
  }, error => emit("firebase-sync-error", { message: `注文状況を受信できませんでした: ${error.message}` }));
  customerOrderStops.set(key, stop);
}

async function ensureCustomer() {
  if (!auth.currentUser) await signInAnonymously(auth);
  return auth.currentUser;
}

async function startCustomer(listener) {
  customerListeners.add(listener);
  try {
    const user = await ensureCustomer();
    readCustomerKeys().forEach(key => watchCustomerOrder(key, user.uid));
    publishCustomerOrders();
    return () => customerListeners.delete(listener);
  } catch (error) {
    customerListeners.delete(listener);
    throw error;
  }
}

async function createCustomerOrder(order) {
  const user = await ensureCustomer();
  const orderRef = push(ref(database, "orders"));
  const record = { ...order, customerUid: user.uid };
  try {
    await set(orderRef, record);
  } catch (error) {
    if (String(error?.message || "").includes("PERMISSION_DENIED")) {
      throw new Error("PERMISSION_DENIED: Firebase Realtime Database rules rejected this order write.");
    }
    throw error;
  }
  saveCustomerKey(orderRef.key);
  watchCustomerOrder(orderRef.key, user.uid);
  return normalizeOrder(record, orderRef.key);
}

function stopStaffOrders() {
  if (staffOrdersStop) {
    staffOrdersStop();
    staffOrdersStop = null;
  }
}

function listenForStaffOrders(user) {
  if (!isStaff(user) || staffOrdersStop) return;
  staffOrdersStop = onValue(ref(database, "orders"), snapshot => {
    const orders = [];
    snapshot.forEach(child => orders.push(normalizeOrder(child.val(), child.key)));
    orders.sort((first, second) => Number(first.t) - Number(second.t));
    emit("firebase-orders", { orders });
  }, error => emit("firebase-sync-error", { message: `注文一覧を受信できませんでした: ${error.message}` }));
}

onAuthStateChanged(auth, user => {
  if (isStaff(user)) listenForStaffOrders(user);
  else stopStaffOrders();
  emit("firebase-auth-changed", { isStaff: isStaff(user), email: isStaff(user) ? user.email : "" });
});

async function signInStaff() {
  const result = await signInWithPopup(auth, new GoogleAuthProvider());
  if (!isStaff(result.user)) {
    await signOut(auth);
    throw new Error(`スタッフ用アカウント（${STAFF_EMAIL}）でログインしてください。`);
  }
  return result.user;
}

window.firebaseSync = {
  createCustomerOrder,
  signInStaff,
  signOut: () => signOut(auth),
  updateOrder: (key, patch) => update(ref(database, `orders/${key}`), patch),
  updateOrders: patches => {
    const updates = {};
    patches.forEach(({ key, patch }) => {
      Object.entries(patch).forEach(([path, value]) => {
        updates[`orders/${key}/${path}`] = value;
      });
    });
    return update(ref(database), updates);
  },
  claimKitchenPrint: async key => {
    const result = await runTransaction(ref(database, `orders/${key}`), order => {
      if (!order || order.kitchenPrinted) return;
      order.kitchenPrinted = true;
      return order;
    });
    return result.committed;
  },
  startCustomer
};

emit("firebase-sync-ready", {});
