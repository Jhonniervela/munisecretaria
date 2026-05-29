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
      
    <script>
        // CLIENTE SUPABASE CONECTADO A TU INSTANCIA
        const SUPABASE_URL = "https://simcrwuckcmckglpyiji.supabase.co";
        const SUPABASE_ANON_KEY = "sb_publishable_qojEI-wMwECF7WKlqbxkjA_WofUwvO-"; 
        const DB = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','set','oct','nov','dic'];
        const ANIO_FISCAL_ACTUAL = 2026;

        function cambiarFasePortal(fase) {
            document.getElementById('portal-search').style.display = (fase === 'search') ? 'block' : 'none';
            document.getElementById('portal-loading').style.display = (fase === 'loading') ? 'block' : 'none';
            document.getElementById('portal-results').style.display = (fase === 'results') ? 'block' : 'none';
        }

        function regresarPortal() {
            document.getElementById('txt-dni').value = '';
            cambiarFasePortal('search');
        }

        function retraso(ms) { return new Promise(res => setTimeout(res, ms)); }

        async function ejecutarConsulta() {
            const dni = document.getElementById('txt-dni').value.trim();
            if(!dni) {
                alert("Por favor, ingrese un número de identificación válido.");
                return;
            }

            cambiarFasePortal('loading');
            const txt = document.getElementById('loading-txt');
            const bar = document.getElementById('bar-fill');
            
            bar.style.width = "25%"; txt.innerText = "Verificando identidad tributaria...";
            
            try {
                // 1. Validar existencia del Contribuyente
                const { data: contribuyentes, error: e1 } = await DB.from('contribuyentes').select('*').eq('num_documento', dni);
                if(e1) throw e1;

                if(!contribuyentes || contribuyentes.length === 0) {
                    setTimeout(() => {
                        alert("El número ingresado no se encuentra registrado en el padrón municipal.");
                        cambiarFasePortal('search');
                    }, 500);
                    return;
                }
                const vecino = contribuyentes[0];

                await retraso(350);
                bar.style.width = "60%" ; txt.innerText = "Consultando base de datos tributaria...";

                // 2. Extraer inmuebles enlazados
                const { data: predios, error: e2 } = await DB.from('predios').select('*').eq('contribuyente_id', vecino.id);
                if(e2) throw e2;

                await retraso(350);
                bar.style.width = "90%" ; txt.innerText = "Calculando liquidaciones anuales...";

                // 3. Procesar meses y estructurar cuadrículas
                await procesarYRenderizarDatos(vecino, predios || []);

                await retraso(150);
                bar.style.width = "100%"; txt.innerText = "Acceso Autorizado.";
                
                setTimeout(() => { cambiarFasePortal('results'); }, 200);

            } catch (err) {
                console.error(err);
                alert("Error de conexión: " + err.message);
                cambiarFasePortal('search');
            }
        }

        async function procesarYRenderizarDatos(vecino, listaPredios) {
            document.getElementById('lbl-nombre').innerText = `¡Hola, ${vecino.nombres} ${vecino.apellidos}!`;
            document.getElementById('lbl-dni').innerText = `DNI/RUC: ${vecino.num_documento} | Domicilio Fiscal: ${vecino.direccion_fiscal || 'San Roque de Cumbaza'}`;

            const boxAlertas = document.getElementById('container-alertas-predial');
            const boxPredios = document.getElementById('container-predios');
            boxAlertas.innerHTML = '';
            boxPredios.innerHTML = '';

            let acumuladoPagado = 0;
            let acumuladoDeuda = 0;

            if(listaPredios.length === 0) {
                boxPredios.innerHTML = `<p class="text-center text-slate-400 text-xs py-6">No se registran predios asignados en este periodo fiscal.</p>`;
                document.getElementById('monto-pagado').innerText = "S/ 0.00";
                document.getElementById('monto-deuda').innerText = "S/ 0.00";
                return;
            }

            for(let p of listaPredios) {
                // Alerta si tiene deudas de años anteriores
                if(p.anio_deuda_predial) {
                    boxAlertas.innerHTML += `
                        <div class="bg-amber-50 border border-amber-200 rounded-[14px] p-4 text-amber-800 text-xs leading-relaxed flex gap-3 mb-3 shadow-sm text-left">
                            <i class="ti ti-alert-square-rounded text-xl text-amber-600 shrink-0"></i>
                            <div>
                                <strong class="uppercase font-black text-amber-900">Notificación de Impuesto Predial</strong><br>
                                Se detectan periodos sin liquidar para el inmueble <strong>"${p.tipo_predio}"</strong> desde el <strong>Año Fiscal ${p.anio_deuda_predial}</strong>.
                            </div>
                        </div>
                    `;
                }

                // Obtener desglose de meses cruzados del 2026
                const { data: controlUnificado } = await DB.from('control_servicios_unificado')
                                                            .select('*')
                                                            .eq('predio_id', p.id)
                                                            .eq('anio', ANIO_FISCAL_ACTUAL);
                const record = controlUnificado ? controlUnificado[0] : null;

                let subServiciosHtml = '';
                const serviciosActivos = [];
                if(p.monto_agua > 0) serviciosActivos.push({ t: 'Arbitrio de Agua Potable', prefijo: 'agua_', cost: p.monto_agua });
                if(p.monto_desague > 0) serviciosActivos.push({ t: 'Sistema de Alcantarillado', prefijo: 'desague_', cost: p.monto_desague });
                if(p.monto_limpieza > 0) serviciosActivos.push({ t: 'Limpieza Pública', prefijo: 'limpieza_', cost: p.monto_limpieza });

                serviciosActivos.forEach(serv => {
                    const mesesBloques = MESES.map(m => {
                        const colName = serv.prefijo + m;
                        const pagado = record ? record[colName] : false;
                        
                        if(pagado) { acumuladoPagado += serv.cost; } else { acumuladoDeuda += serv.cost; }

                        return `<div class="month-block ${pagado ? 'm-paid' : 'm-debt'}">${m}</div>`;
                    }).join('');

                    subServiciosHtml += `
                        <div class="mt-3 border-t border-dashed border-slate-200 pt-3">
                            <div class="flex justify-between text-xs font-bold text-slate-700 mb-1.5">
                                <span><i class="ti ti-chevrons-right text-[10px] text-[#00A350]"></i> ${serv.t}</span>
                                <span class="font-mono text-slate-400">S/ ${serv.cost.toFixed(2)} / mes</span>
                            </div>
                            <div class="grid grid-cols-6 sm:grid-cols-12 gap-1">${mesesBloques}</div>
                        </div>
                    `;
                });

                const claseInmueble = p.tipo_predio === 'URBANO' ? 'bg-sky-50 text-sky-700 border border-sky-200' : 'bg-amber-50 text-amber-700 border border-amber-200';
                boxPredios.innerHTML += `
                    <div class="border border-slate-200 rounded-[14px] p-5 bg-white mb-4 shadow-sm text-left">
                        <div class="flex justify-between items-center mb-2">
                            <div class="text-sm font-black text-slate-800 flex items-center gap-1.5"><i class="ti ti-map-pin-pin text-[#00A350] text-base"></i> ${escapar(p.tipo_predio)}</div>
                            <span class="p-0.5 px-2 rounded-md text-[9px] font-black tracking-wide ${claseInmueble}">${p.tipo_predio}</span>
                        </div>
                        <p class="text-xs text-slate-400 mb-1">${escapar(p.direccion_predio)}</p>
                        ${subServiciosHtml}
                    </div>
                `;
            }

            document.getElementById('monto-pagado').innerText = `S/ ${acumuladoPagado.toFixed(2)}`;
            document.getElementById('monto-deuda').innerText = `S/ ${acumuladoDeuda.toFixed(2)}`;
        }

        function escapar(t) {
            if(!t) return '';
            const d = document.createElement('div'); d.textContent = t; return d.innerHTML;
        }
    </script>
</script>
