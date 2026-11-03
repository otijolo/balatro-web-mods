/* Game archives are stored only in this browser's IndexedDB. */
function openGameDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("BalatroCacheDB", 1);
        let blocked = false;
        request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains("cache")) {
                request.result.createObjectStore("cache");
            }
        };
        request.onsuccess = () => {
            const db = request.result;
            db.onversionchange = () => db.close();
            if (blocked) db.close();
            else resolve(db);
        };
        request.onerror = () => reject(request.error || new Error("Não foi possível abrir o armazenamento local."));
        request.onblocked = () => {
            blocked = true;
            reject(new Error("Feche as outras abas deste site para atualizar o armazenamento local."));
        };
    });
}

async function cacheTransaction(mode, operation) {
    const db = await openGameDB();
    return new Promise((resolve, reject) => {
        let tx, result, failure, finished = false;
        const finish = error => {
            if (finished) return;
            finished = true;
            db.close();
            if (error) reject(error);
            else resolve(result);
        };
        try {
            tx = db.transaction("cache", mode);
            tx.oncomplete = () => finish(failure);
            tx.onerror = () => {
                failure = failure || tx.error || new Error("Erro no armazenamento local.");
            };
            tx.onabort = () => finish(failure || tx.error || new Error("A operação de armazenamento foi cancelada."));
            const request = operation(tx.objectStore("cache"));
            request.onsuccess = () => { result = request.result; };
            // Request success alone does not guarantee that a write commits.
            request.onerror = () => { failure = request.error || new Error("Falha ao acessar a versão salva."); };
        } catch (error) {
            finish(error);
            if (tx) {
                try { tx.abort(); } catch (_) { /* Already inactive. */ }
            }
        }
    });
}

async function loadCachedGame(key = "vanilla") {
    const game = await cacheTransaction("readonly", store => store.get(key));
    return game === undefined ? null : game;
}

async function saveGameToCache(blob, key = "vanilla") {
    await cacheTransaction("readwrite", store => store.put(blob, key));
}

async function deleteCachedGame(key) {
    await cacheTransaction("readwrite", store => store.delete(key));
}

async function listCachedVersions() {
    return cacheTransaction("readonly", store => store.getAllKeys());
}
