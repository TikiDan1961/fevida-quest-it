"use strict";
// Fe y Vida Quest service worker (2026-11-02, per Dan: the app runs as an installed app, with no browser address bar).
// The page registers it as sw.js?v=<APP_BUILD>, so every new build is a new worker with its own, empty cache: a picture that changed under the same name can never be served stale.
// The pages (navigations) come from the network first, so a new build is picked up as soon as the phone is online, and fall back to the saved copy when it is not (or is very slow).
// Everything else (pictures, sounds, fonts, scripts) is saved the first time it is fetched and served from the cache after that, so the game also plays without a connection once it has been played online.
var V = new URL(self.location.href).searchParams.get("v") || "dev";
var CACHE = "fevidaIt-" + V;
var NET_WAIT_MS = 4000;

self.addEventListener("install", function(e){
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function(c){ return c.add(new Request("./", {cache: "reload"})).catch(function(){}); }));
});
self.addEventListener("activate", function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.filter(function(k){ return k.indexOf("fevidaIt-") === 0 && k !== CACHE; }).map(function(k){ return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});

function pageKey(url){ return new Request(url.origin + url.pathname); }
function networkFirst(req){
  var url = new URL(req.url);
  return new Promise(function(resolve){
    var done = false;
    function fromCache(){
      return caches.open(CACHE).then(function(c){
        return c.match(pageKey(url)).then(function(r){ return r || c.match("./"); }).then(function(r){ return r || c.match("index.html"); });
      });
    }
    var timer = setTimeout(function(){ fromCache().then(function(r){ if(r && !done){ done = true; resolve(r); } }); }, NET_WAIT_MS);
    fetch(req).then(function(res){
      clearTimeout(timer);
      if(res && res.ok){ var copy = res.clone(); caches.open(CACHE).then(function(c){ c.put(pageKey(url), copy); }); }
      if(!done){ done = true; resolve(res); }
    }).catch(function(){
      clearTimeout(timer);
      fromCache().then(function(r){ if(!done){ done = true; resolve(r || Response.error()); } });
    });
  });
}
function cacheFirst(req){
  return caches.open(CACHE).then(function(c){
    return c.match(req).then(function(hit){
      if(hit) return hit;
      return fetch(req).then(function(res){
        if(res && res.ok && res.status === 200 && res.type === "basic") c.put(req, res.clone());
        return res;
      });
    });
  });
}
self.addEventListener("fetch", function(e){
  var req = e.request;
  if(req.method !== "GET") return;
  var url = new URL(req.url);
  if(url.origin !== self.location.origin) return;
  if(req.headers.has("range")) return;                        // a partial request (some media players) goes straight to the network
  if(url.pathname.slice(-6) === "/sw.js") return;
  if(req.mode === "navigate"){ e.respondWith(networkFirst(req)); return; }
  e.respondWith(cacheFirst(req));
});
