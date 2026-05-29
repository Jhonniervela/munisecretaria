   <script>
  if ('serviceWorker' in navigator) {
    // Registramos el sw.js que está en la raíz
    navigator.serviceWorker.register('./sw.js')
      .then(reg => {
        console.log('LlactaYachay: Service Worker Activo', reg.scope);
      })
      .catch(err => {
        console.error('LlactaYachay: Error de registro', err);
      });
  }
</script>
