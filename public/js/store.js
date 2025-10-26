console.log('[store] loaded');

(function(){
  const DB_NAME = 'assessment_chat_ui';
  const DB_VER = 1;
  const STORE = 'ui';

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'sessionId' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function getUI(sessionId) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const st = tx.objectStore(STORE);
      const rq = st.get(sessionId);
      rq.onsuccess = () => resolve(rq.result ? rq.result.data : null);
      rq.onerror = () => reject(rq.error);
    });
  }

  async function setUI(sessionId, data) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const st = tx.objectStore(STORE);
      st.put({ sessionId, data });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  window.UIStore = { getUI, setUI };
})();
