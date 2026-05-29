
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

// 1. Configuración de la Muni
const MUNI = {
    telefono: "51969356686",
    abre: 7.5,  // 07:30 AM
    cierra: 15.5 // 03:30 PM
};

// 2. ELIMINAR REGISTRO DE SERVICE WORKER (Para que no falle más)
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(function(registrations) {
        for(let registration of registrations) {
            registration.unregister(); // Esto borra el registro antiguo
        }
    });
}

// 3. Función de Horario
function controlarHorario() {
    const ahora = new Date();
    const diaSemana = ahora.getDay(); // 0=Dom, 1=Lun, ..., 5=Vie, 6=Sáb
    const hora = ahora.getHours();
    const minutos = ahora.getMinutes();
    const horaDecimal = hora + (minutos / 60);

    const btn = document.getElementById('btn-reporte-final');
    const ind = document.getElementById('indicador-horario');

    // Validación: Lunes a Viernes (1 a 5) Y dentro del rango de horas
    const esDiaLaboral = diaSemana >= 1 && diaSemana <= 5;
    const esHoraLaboral = horaDecimal >= MUNI.abre && horaDecimal < MUNI.cierra;
    const estaAbierto = esDiaLaboral && esHoraLaboral;

    if (btn) {
        if (estaAbierto) {
            // Activa el botón y pone color verde
            btn.disabled = false;
            btn.className = "w-full bg-green-600 text-white p-6 rounded-[2.5rem] font-black uppercase tracking-[0.2em] shadow-xl flex items-center justify-center gap-4 transition-all active:scale-95";
            btn.innerHTML = '<i class="fa-brands fa-whatsapp text-2xl"></i> Enviar al WhatsApp';
            if(ind) ind.innerHTML = '<span class="bg-green-100 text-green-700 px-4 py-2 rounded-full text-[10px] font-black uppercase italic tracking-widest animate-pulse">● Oficina Atendiendo</span>';
        } else {
            // Desactiva el botón y pone color rojo/gris
            btn.disabled = true;
            btn.className = "w-full bg-red-500 text-white p-6 rounded-[2.5rem] font-black uppercase tracking-[0.2em] shadow-xl flex items-center justify-center gap-4 opacity-60 cursor-not-allowed";
            
            // Texto dinámico según la razón del cierre
            let motivo = !esDiaLaboral ? "Cerrado (Atención Lun-Vie)" : "Fuera de Horario";
            btn.innerHTML = `<i class="fa-solid fa-clock text-2xl"></i> ${motivo}`;
            
            if(ind) ind.innerHTML = '<span class="bg-red-100 text-red-700 px-4 py-2 rounded-full text-[10px] font-black uppercase italic tracking-widest">● Mesa de Partes Cerrada</span>';
        }
    }
}

// 4. Función de Envío
// 4. Función de Envío (Actualizada: Sin DNI para mayor agilidad)
function enviarAlWhatsApp(event) {
    event.preventDefault();

    // Verificación final de seguridad
    const ahora = new Date();
    const hDec = ahora.getHours() + (ahora.getMinutes() / 60);
    const dSem = ahora.getDay();
    
    if (!(dSem >= 1 && dSem <= 5 && hDec >= MUNI.abre && hDec < MUNI.cierra)) {
        alert("El horario de atención ha terminado. Por favor, intente mañana desde las 07:30 AM.");
        return;
    }

    const nombre = document.getElementById('repo_nombre').value;
    const msg    = document.getElementById('repo_detalle').value;

    // Construcción del texto sin el campo DNI
    const texto = `🚨 *REPORTE CIUDADANO* 🚨%0A%0A👤 *Nombre:* ${nombre}%0A📝 *Detalle:* ${msg}`;
    
    window.open(`https://wa.me/${MUNI.telefono}?text=${texto}`, '_blank');
}

// Iniciar al cargar la web
window.onload = controlarHorario;

   

   const tasas = [
    // --- SERVICIOS TUPA ---
    { tipo: "TUPA", n: "Liquidación de Autovaluo", p: "Monto Variable", icon: "fa-file-invoice-dollar", r: "• Caso A (Nuevo): Escritura o Copia Literal + DNI.<br>• Caso B (Anual): DNI y Código de Contribuyente." },
    { tipo: "TUPA", n: "Licencia de Funcionamiento", p: "Monto Variable", icon: "fa-store", r: "• Solicitud dirigida a la oficina de rentas.<br>• Fotocopia del DNI.<br>• Fotocopia de RUC.<br>• Certificado Sanitario.<br>• Inspección de Defensa Civil." },
    { tipo: "TUPA", n: "Constancia de No Adeudo", p: "S/. 10.00", icon: "fa-certificate", r: "• Recibo de pago por derecho de trámite.<br>• Estar al día en el pago de Impuesto Predial y Arbitrios.<br>• Copia de DNI del titular." },
    
    { tipo: "TUPA", n: "Expedicion de Constancia Negativa de Catastro", p: "S/. 30.00", icon: "fa-map-location-dot", r: "• Solicitud dirigida al director de infraestructura.<br>• Pago de derecho de emisión.<br>• Fotocopia del DNI." },
  
 
    // --- PROCEDIMIENTOS REGISTRO CIVIL (TUPA) ---
    { 
        tipo: "TUPA", 
        n: "Inscripción Extraordinaria: Mayores de 18 años", 
        p: "S/. 50.00", 
        icon: "fa-address-card", 
        r: "1. Solicitud en Formulario Único (FUPR) dirigida al Jefe de Registro Civil.<br>2. Pago de derecho de tramitación (S/. 50.00).<br>3. Pago de derecho de inscripción.<br>4. Adjuntar uno: Certificado de nacimiento, Partida de bautismo, Certificado escolar o Declaración Jurada de autoridad.<br>5. Certificado de antecedentes policiales o determinación de huella dactilar.<br>6. Declaración jurada de dos testigos ante el Registrador.<br><b>Plazo:</b> 5 días hábiles." 
    },
    { 
        tipo: "TUPA", 
        n: "Reconocimiento de Hijos Extramatrimoniales (Mandato Judicial)", 
        p: "S/. 50.00", 
        icon: "fa-person-rays", 
        r: "1. Solicitud (FUT) dirigida al Jefe de Registro Civil.<br>2. Pago de derecho de tramitación (S/. 50.00).<br>3. Pago de derecho de inscripción.<br>4. Fotocopia de DNI o Carné de Extranjería.<br>5. Acta rubricada ante el Registrador o Fotocopia autenticada de Escritura Pública/Testamento.<br><b>Plazo:</b> 5 días hábiles." 
    },
    { 
        tipo: "TUPA", 
        n: "Inscripción de Adopción (Por Mandato Judicial)", 
        p: "S/. 30.00", 
        icon: "fa-children", 
        r: "1. Solicitud (FUT) dirigida al Jefe de Registro Civil.<br>2. Pago de derecho de inscripción (S/. 30.00) - Tramitación gratuita.<br>3. Fotocopia de DNI o Carné de Extranjería de adoptantes.<br>4. Fotocopia autenticada de la Resolución Judicial de adopción.<br>5. Constancia de resolución consentida o ejecutoriada.<br><b>Plazo:</b> 5 días hábiles." 
    },
    { 
        tipo: "TUPA", 
        n: "Inscripción de Adopción (Por Parte Notarial)", 
        p: "S/. 30.00", 
        icon: "fa-file-signature", 
        r: "1. Solicitud (FUT) dirigida al Jefe de Registro Civil.<br>2. Pago de derecho de inscripción (S/. 30.00) - Tramitación gratuita.<br>3. Fotocopia de DNI o Carné de Extranjería de los adoptantes.<br>4. Remisión de partes de inscripción (oficio del notario con transcripción de escritura pública).<br><b>Plazo:</b> 5 días hábiles." 
    },

    // --- PROCEDIMIENTOS INFRAESTRUCTURA (TUPA) ---
    { 
        tipo: "TUPA", 
        n: "Certificado de Jurisdicción", 
        p: "S/. 30.00", 
        icon: "fa-map-location-dot", 
        r: "1. Solicitud dirigida al Alcalde.<br>2. Copia simple de DNI.<br>3. Copia literal de dominio o documento de propiedad.<br>4. Plano de ubicación y perimétrico.<br>5. Recibo de pago por derecho de trámite." 
    },
    { 
        tipo: "TUPA", 
        n: "Certificado de Numeración de Finca", 
        p: "S/. 25.00", 
        icon: "fa-house-chimney-user", 
        r: "1. Solicitud dirigida al Alcalde.<br>2. Copia simple de DNI del propietario.<br>3. Copia de Autovaluo (PU y HR) actualizado.<br>4. Recibo de pago por derecho de trámite." 
    },
    // --- INSCRIPCIONES DE NACIMIENTO (TUPA) ---
    { 
        tipo: "TUPA", 
        n: "Inscripción Ordinaria: Nacimientos en Hospitales o Centros de Salud", 
        p: "GRATUITO", 
        icon: "fa-hospital-user", 
        r: "• Plazo: Hasta 60 días de nacido.<br>1. Solicitud en Formulario Único (FUPR).<br>2. Fotocopia de DNI o Carné de Extranjería de los padres.<br>3. Certificado de nacido vivo (emitido por médico u obstetra) o Constancia de nacimiento del nosocomio.<br><b>Plazo de entrega:</b> 1 día hábil (Aprobación automática)." 
    },
    { 
        tipo: "TUPA", 
        n: "Inscripción Ordinaria: Nacimientos en Domicilios o Centros Particulares", 
        p: "GRATUITO", 
        icon: "fa-house-medical", 
        r: "• Plazo: Hasta 60 días de nacido.<br>1. Solicitud en Formulario Único (FUPR).<br>2. Fotocopia de DNI o Carné de Extranjería del administrado.<br>3. Certificado de nacimiento emitido por profesional de salud o Constancia autorizada.<br><b>Plazo de entrega:</b> 1 día hábil (Aprobación automática)." 
    },
    { 
        tipo: "TUPA", 
        n: "Inscripción Extemporánea: Menores (Fuera de plazo de ley)", 
        p: "Derecho de Trámite", 
        icon: "fa-clock-rotate-left", 
        r: "• Para menores no inscritos tras 60 días de nacido.<br>1. Solicitud en Formulario Único (FUPR).<br>2. Fotocopia de DNI de los padres.<br>3. Pruebas de nacimiento (Uno: Certificado médico, Partida bautismo, Matrícula escolar o Declaración de autoridad).<br>4. Declaración jurada de 2 testigos ante el Registrador.<br>5. Documento que acredite parentesco.<br><b>Plazo de entrega:</b> 5 días hábiles." 
    },
    // --- DEFUNCIONES Y EXISTENCIA (TUPA) ---
    { 
        tipo: "TUPA", 
        n: "Inscripción de Defunción (Causas Naturales)", 
        p: "Derecho de Inscripción", 
        icon: "fa-book-dead", 
        r: "1. Solicitud (FUT) al Jefe de Registro Civil.<br>2. Pago de derecho de inscripción (Tramitación gratuita).<br>3. Copia de DNI del solicitante.<br>4. Certificado de Defunción médico o Declaración Jurada de autoridad.<br>5. DNI o Acta de Nacimiento del fallecido.<br><b>Plazo:</b> 5 días hábiles." 
    },
    { 
        tipo: "TUPA", 
        n: "Inscripción de Defunción (Muerte Violenta)", 
        p: "Derecho de Inscripción", 
        icon: "fa-triangle-exclamation", 
        r: "• Además de requisitos básicos:<br>1. Copia certificada del parte policial o judicial.<br>2. Certificado o protocolo de necropsia del médico legista.<br><b>Plazo:</b> 5 días hábiles." 
    },
    { 
        tipo: "TUPA", 
        n: "Inscripción de Defunción (Muerte Presunta)", 
        p: "Derecho de Inscripción", 
        icon: "fa-scale-balanced", 
        r: "1. Copia certificada de resolución judicial que declara muerte presunta.<br>2. Constancia de resolución consentida o ejecutoriada.<br><b>Plazo:</b> 5 días hábiles." 
    },
    { 
        tipo: "TUPA", 
        n: "Inscripción de Reconocimiento de Existencia", 
        p: "S/. 30.00", 
        icon: "fa-user-check", 
        r: "1. Solicitud y copia de DNI.<br>2. Copia certificada de resolución judicial de existencia.<br>3. Constancia de resolución ejecutoriada.<br><b>Plazo:</b> 5 días hábiles." 
    },

    // --- EXPEDICIÓN DE COPIAS CERTIFICADAS (TUPA) ---
    { 
        tipo: "TUPA", 
        n: "Copia Certificada de Acta (Uso Local)", 
        p: "S/. 10.00 - 15.00", 
        icon: "fa-copy", 
        r: "• Nacimiento: S/. 10.00<br>• Matrimonio: S/. 15.00<br>• Defunción: S/. 15.00<br>1. Solicitud (FUT).<br>2. Recibo de pago correspondiente.<br><b>Plazo:</b> 1 día (Aprobación automática)." 
    },
    { 
        tipo: "TUPA", 
        n: "Copia Certificada de Acta (Para el Extranjero)", 
        p: "S/. 20.00", 
        icon: "fa-passport", 
        r: "• Costo por cada acta (Nacimiento, Matrimonio o Defunción).<br>1. Solicitud (FUT).<br>2. Recibo de pago de S/. 20.00.<br><b>Plazo:</b> 1 día (Aprobación automática)." 
    },
    // --- RECTIFICACIONES Y CERTIFICADOS (TUPA) ---
    { 
        tipo: "TUPA", 
        n: "Rectificación Administrativa de Actas", 
        p: "S/. 50.00", 
        icon: "fa-file-pen", 
        r: "• Para corrección de errores evidentes en actas.<br>1. Solicitud (FUT) al Jefe de Registro Civil.<br>2. Pago de derecho de trámite (S/. 50.00).<br>3. Copia de DNI.<br>4. Documento que dio origen al error (autenticado).<br><b>Plazo:</b> 5 días hábiles (Silencio Administrativo Positivo)." 
    },
    { 
        tipo: "TUPA", 
        n: "Expedición de Certificado Domiciliario", 
        p: "S/. 15.00", 
        icon: "fa-house-chimney-window", 
        r: "1. Solicitud (FUT) al Jefe de Registro Civil.<br>2. Pago de derecho de trámite (S/. 15.00).<br>3. Copia de DNI.<br>4. Recibo original y copia de servicios (Luz, Agua o Teléfono).<br>5. Declaración Jurada de domicilio.<br><b>Plazo:</b> 1 día hábil (Aprobación automática)." 
    },
    { 
        tipo: "TUPA", 
        n: "Expedición de Constancia de No Inscripción", 
        p: "S/. 20.00", 
        icon: "fa-file-circle-xmark", 
        r: "• Certifica que un hecho no está registrado en esta municipalidad.<br>1. Solicitud (FUT) al Jefe de Registro Civil.<br>2. Pago de derecho de trámite (S/. 20.00).<br>3. Copia de DNI.<br><b>Plazo:</b> 10 días hábiles (Silencio Administrativo Negativo)." 
    },
    // --- IMPUESTO PREDIAL Y RENTAS (TUPA) ---
    { 
        tipo: "TUPA", 
        n: "Declaración Jurada del Impuesto Predial", 
        p: "S/. 10.00", 
        icon: "fa-file-signature", 
        r: "• Registro o actualización de predio.<br>1. Formulario de DJ llenado.<br>2. Pago de derecho (S/. 10.00).<br>3. Copia de DNI.<br>4. Copia de minuta o contrato compra-venta.<br>5. Copia de comprobante de Alcabala (si aplica).<br><b>Plazo:</b> 1 día (Automático)." 
    },
    { 
        tipo: "TUPA", 
        n: "Inafectación al Pago del Impuesto Predial", 
        p: "S/. 10.00", 
        icon: "fa-hand-holding-dollar", 
        r: "1. Solicitud y pago de derecho (S/. 10.00).<br>2. Copia de DNI.<br>3. Copia fedateada de Escritura Pública o minuta.<br>4. Recibos de pago (Predial, Alcabala, Limpieza) de los últimos 3 meses.<br><b>Plazo:</b> 5 días (Silencio Positivo)." 
    },
        { 
        tipo: "TUPA", 
        n: "Conexion de Alcantarillado", 
        p: "S/. 15.00", 
        icon: "fa-hand-holding-dollar", 
        r: "1. Solicitud y pago de derecho (S/. 15.00).<br>2. Copia de DNI.<br>3. Copia Escritura Pública o minuta.<br>4. Plano de donde será colocado el alcantarillado.<br><b>Plazo:</b> 5 días (Silencio Positivo)." 
    },
         { 
        tipo: "TUPA", 
        n: "Conexion de Agua", 
        p: "S/. 10.00", 
        icon: "fa-hand-holding-dollar", 
        r: "1. Solicitud y pago de derecho (S/. 10.00).<br>2. Copia de DNI.<br>3. Copia Escritura Pública o minuta.<br>4. Plano de donde será instalado.<br><b>Plazo:</b> 5 días (Silencio Positivo)." 
    },
    { 
        tipo: "TUPA", 
        n: "Pago Fraccionado del Impuesto Predial (03 cuotas)", 
        p: "S/. 12.00", 
        icon: "fa-calendar-check", 
        r: "1. Solicitud.<br>2. Pago de derecho (S/. 12.00).<br>3. Copia de DNI.<br>4. Formato de DJ (Autovalúo).<br><b>Plazo:</b> 1 día (Automático)." 
    },

    // --- ESPECTÁCULOS PÚBLICOS (TUPA) ---
    { 
        tipo: "TUPA", 
        n: "Impuesto a los Espectáculos Públicos no Deportivos", 
        p: "S/. 48.00", 
        icon: "fa-ticket", 
        r: "1. Formulario de DJ llenado.<br>2. Pago de derecho (S/. 48.00).<br>3. Copia de DNI.<br>4. Fotocopia fedateada de factura/boleta de tickets.<br><b>Plazo:</b> 1 día (Automático)." 
    },
    { 
        tipo: "TUPA", 
        n: "Exoneración de Impuesto (Eventos Culturales)", 
        p: "S/. 5.00", 
        icon: "fa-clapperboard", 
        r: "1. Solicitud y pago de derecho (S/. 5.00).<br>2. Copia de DNI.<br>3. Documento del Ministerio de Cultura (calificación cultural).<br><b>Plazo:</b> 2 días (Silencio Negativo)." 
    },
    { 
        tipo: "TUPA", 
        n: "Autorización de Espectáculos Públicos No Deportivos", 
        p: "S/. 10.00", 
        icon: "fa-masks-theater", 
        r: "1. Solicitud y copia de DNI.<br>2. Copia de factura de impresión de tickets.<br>3. Certificado de Seguridad en Defensa Civil.<br>4. Pago de derecho (S/. 10.00).<br><b>Plazo:</b> 5 días (Silencio Positivo)." 
    },

    // --- CONSTANCIAS DE DEUDA (TUPA) ---
    { 
        tipo: "TUPA", 
        n: "Expedición de Estado de Cuenta Tributaria", 
        p: "S/. 5.00", 
        icon: "fa-file-invoice-dollar", 
        r: "1. Solicitud dirigida a Rentas.<br>2. Pago de derecho (S/. 5.00).<br>3. Copia de DNI.<br><b>Plazo:</b> 1 día (Automático)." 
    },
   
    // --- LICENCIAS DE FUNCIONAMIENTO (TUPA) ---
    { 
        tipo: "TUPA", 
        n: "Licencia: Establecimientos Comerciales (Hasta 100 m2)", 
        p: "S/. 100.00", 
        icon: "fa-store", 
        r: "1. DNI y RUC activo.<br>2. Certificado de Defensa Civil.<br><b>Plazo:</b> 10 días hábiles." 
    },
    { 
        tipo: "TUPA", 
        n: "Licencia: Locales Comerciales (100 m2 a 500 m2)", 
        p: "S/. 180.00", 
        icon: "fa-shop", 
        r: "1. DNI y RUC.<br>2. Inspección Técnica de Seguridad (ITSE) Básica.<br><b>Plazo:</b> 10 días hábiles." 
    },
    { 
        tipo: "TUPA", 
        n: "Licencia: Expendio de Comidas y Bebidas", 
        p: "S/. 100.00", 
        icon: "fa-utensils", 
        r: "1. DNI y RUC.<br>2. Certificado Sanitario.<br>3. Certificado de Defensa Civil.<br><b>Plazo:</b> 10 días hábiles." 
    },
    { 
        tipo: "TUPA", 
        n: "Licencia: Molinos de Arroz y Granos", 
        p: "S/. 100.00", 
        icon: "fa-wheat-awn", 
        r: "1. RUC activo.<br>2. Certificado Sanitario.<br>3. Certificado de Defensa Civil.<br><b>Plazo:</b> 15 días hábiles." 
    },
    { 
        tipo: "TUPA", 
        n: "Licencia para MYPES", 
        p: "S/. 180.00", 
        icon: "fa-industry", 
        r: "1. Acreditar condición de Micro o Pequeña Empresa.<br>2. Requisitos de ley para el giro correspondiente.<br><b>Plazo:</b> 10 días hábiles." 
    },
    { 
        tipo: "TUPA", 
        n: "Renovación o Duplicado de Licencia", 
        p: "S/. 50.00 - 100.00", 
        icon: "fa-arrows-rotate", 
        r: "• Renovación (Cambio giro/domicilio): S/. 100.00.<br>• Duplicado de Licencia: S/. 50.00.<br>1. Solicitud y recibo de pago." 
    },
    // --- EDIFICACIONES Y OBRAS DETALLADO (TUPA) ---
    { 
        tipo: "TUPA", 
        n: "Revisión y Calificación de Anteproyecto en Consulta", 
        p: "S/. 35.00", 
        icon: "fa-magnifying-glass-chart", 
        r: "<b>Requisitos Completos:</b><br>" +
           "1. Presentación del Formulario Único Oficial debidamente llenado.<br>" +
           "2. Comprobante de pago por derecho de revisión (S/. 35.00).<br>" +
           "3. Copia simple del Certificado de Parámetros Urbanísticos y Edificatorios.<br>" +
           "4. Copia del Título de Propiedad o documento que acredite la titularidad.<br>" +
           "5. Planos de Arquitectura (Plantas, Cortes y Elevaciones) a escala 1/100.<br>" +
           "6. Memoria Descriptiva detallando la propuesta arquitectónica.<br>" +
           "<b>Plazo:</b> 5 días hábiles." 
    },
    { 
        tipo: "TUPA", 
        n: "Análisis y Calificación para Remodelación, Modificación o Reparación", 
        p: "S/. 50.00", 
        icon: "fa-trowel-bricks", 
        r: "<b>Requisitos Completos:</b><br>" +
           "1. Formulario Único Oficial suscrito por el propietario y profesionales responsables.<br>" +
           "2. Pago por derecho de análisis y calificación (S/. 50.00).<br>" +
           "3. Copia literal de dominio expedida por SUNARP (no mayor a 30 días).<br>" +
           "4. Declaratoria de Fábrica de la edificación existente inscrita en registros.<br>" +
           "5. Planos de replanteo de arquitectura (muros a demoler y muros nuevos).<br>" +
           "6. Presupuesto de obra detallado a nivel de subpartidas firmado por profesional.<br>" +
           "7. En caso de Propiedad Horizontal: Autorización de la Junta de Propietarios.<br>" +
           "<b>Plazo:</b> 15 días hábiles." 
    },
    { 
        tipo: "TUPA", 
        n: "Análisis y Calificación para Obras Menores (Hasta 30 m²)", 
        p: "S/. 40.00", 
        icon: "fa-hammer", 
        r: "<b>Requisitos Completos:</b><br>" +
           "1. Formulario Único de Edificación (FUE) y pago de tasa (S/. 40.00).<br>" +
           "2. Documento que acredite la propiedad (Copia de Título o Contrato).<br>" +
           "3. Memoria Descriptiva detallada indicando: naturaleza de la obra, fecha de inicio, plazo de ejecución y presupuesto estimado.<br>" +
           "4. Plano de Ubicación con esquema de localización.<br>" +
           "5. Plano de estructuras o detalles constructivos según la obra a realizar.<br>" +
           "6. Carta de responsabilidad de obra firmada por un Ingeniero o Arquitecto colegiado.<br>" +
           "<b>Plazo:</b> 15 días hábiles." 
    },
    { 
        tipo: "TUPA", 
        n: "Análisis y Calificación para Licencia de Demolición", 
        p: "S/. 25.00", 
        icon: "fa-house-fire", 
        r: "<b>Requisitos Completos:</b><br>" +
           "1. Formulario Único Oficial debidamente foliado.<br>" +
           "2. Recibo de pago por derecho de trámite (S/. 25.00).<br>" +
           "3. Copia simple del DNI del propietario y Título de Propiedad.<br>" +
           "4. Plano de Planta a escala 1/75, donde se delinee claramente las zonas objeto de demolición.<br>" +
           "5. Plan de seguridad y contingencia para la protección de predios colindantes y vía pública.<br>" +
           "6. De ser necesario: Autorización de uso de explosivos emitida por la autoridad competente.<br>" +
           "<b>Plazo:</b> 15 días hábiles." 
    },
    { 
        tipo: "TUPA", 
        n: "Análisis y Calificación de Expediente para Licencia de Edificación Nueva", 
        p: "s/. 45.00", 
        icon: "fa-building-shield", 
        r: "<b>Requisitos Detallados (Procedimiento 53):</b><br>" +
           "1. Formulario Único Oficial (parte 1), firmado por el propietario, abogado y profesional responsable (por triplicado).<br>" +
           "2. Hoja de trámite correspondiente de la municipalidad.<br>" +
           "3. Pago por derecho de análisis y calificación del expediente.<br>" +
           "4. Fotocopia del DNI o carné de extranjería del administrado.<br>" +
           "5. Copia simple del certificado literal de dominio o del título de propiedad.<br>" +
           "6. Certificado de habilitación profesional de los proyectistas y del responsable de obra.<br>" +
           "7. Certificado de parámetros urbanísticos y edificatorios vigentes.<br>" +
           "8. Juego de Planos completos: Localización y ubicación, Arquitectura, Estructuras, Instalaciones Sanitarias e Instalaciones Eléctricas.<br>" +
           "9. Fotografías a color del predio y entorno.<br>" +
           "10. Memoria justificativa del proyecto.<br>" +
           "11. Estudio de impacto ambiental (según corresponda).<br>" +
           "12. Autorizaciones de otros sectores cuando las normas vigentes lo requieran.<br>" +
           "<b>Plazo de evaluación:</b> 15 a 30 días hábiles según complejidad." 
    },
    // --- AUTORIZACIÓN PARA USO DE LA VÍA PÚBLICA (TUPA) ---
    { 
        tipo: "TUPA", 
        n: "Autorización de Vía Pública: Proselitismo Político", 
        p: "S/. 50.00", 
        icon: "fa-bullhorn", 
        r: "1. Solicitud dirigida al Director de Infraestructura.<br>2. Copia de DNI del solicitante o representante.<br>3. Comprobante de pago (S/. 50.00).<br>4. Implementación de dispositivos de prevención y advertencia.<br><b>Plazo:</b> 5 días hábiles." 
    },
    { 
        tipo: "TUPA", 
        n: "Autorización de Vía Pública: Fines Evangelizadores", 
        p: "S/. 20.00", 
        icon: "fa-cross", 
        r: "1. Solicitud dirigida al Director de Infraestructura.<br>2. Copia de DNI del solicitante.<br>3. Comprobante de pago (S/. 20.00).<br>4. Uso de dispositivos de seguridad vial.<br><b>Plazo:</b> 5 días hábiles." 
    },
    { 
        tipo: "TUPA", 
        n: "Autorización de Vía Pública: Actividades Sociales/Deportivas", 
        p: "S/. 15.00 - 20.00", 
        icon: "fa-volleyball", 
        r: "• Bloqueo Parcial: S/. 15.00 | Bloqueo Total: S/. 20.00.<br>1. Solicitud detallando el tipo de actividad.<br>2. Copia de DNI.<br>3. Comprobante de pago según el grado de ocupación.<br><b>Plazo:</b> 5 días hábiles." 
    },
    { 
        tipo: "TUPA", 
        n: "Autorización de Vía Pública: Anuncios, Toldos y Cornisas", 
        p: "S/. 50.00", 
        icon: "fa-rectangle-ad", 
        r: "1. Solicitud formal de instalación.<br>2. Copia de DNI.<br>3. Comprobante de pago (S/. 50.00).<br>4. Croquis simple de ubicación o plano detallado.<br><b>Plazo:</b> 5 días hábiles." 
    },
    { 
        tipo: "TUPA", 
        n: "Ocupación de Vía: Agregados o Trabajos de Construcción", 
        p: "S/. 5.00 - 20.00", 
        icon: "fa-trowel-bricks", 
        r: "• Agregados: S/. 5.00 a 10.00 (por día).<br>• Trabajos Civiles: S/. 10.00 a 20.00.<br>1. Solicitud indicando tiempo de ocupación.<br>2. Copia de DNI.<br>3. Comprobante de pago según tarifa diaria.<br><b>Plazo:</b> 5 días hábiles." 
    },

    // --- CERTIFICADOS Y CONSTANCIAS TÉCNICAS (TUPA) ---
    { 
        tipo: "TUPA", 
        n: "Expedición de Constancia Negativa Catastral", 
        p: "S/. 30.00", 
        icon: "fa-file-circle-xmark", 
        r: "1. Solicitud dirigida al área técnica.<br>2. Copia de DNI del propietario.<br>3. Comprobante de pago por derecho de trámite (S/. 30.00).<br><b>Plazo:</b> 5 días hábiles." 
    },
    { 
        tipo: "TUPA", 
        n: "Expedición de Constancia de Posesión", 
        p: "S/. 20.00", 
        icon: "fa-house-chimney-user", 
        r: "1. Solicitud formal acreditando posesión.<br>2. Copia de DNI.<br>3. Comprobante de pago por derecho de trámite (S/. 20.00).<br><b>Plazo:</b> 5 días hábiles." 
    },
    { 
        tipo: "TUPA", 
        n: "Certificado de Nomenclatura o Alineamiento", 
        p: "S/. 15.00 - 20.00", 
        icon: "fa-map-location-dot", 
        r: "• Nomenclatura: S/. 20.00 | Alineamiento: S/. 15.00.<br>1. Solicitud en formulario oficial.<br>2. Hoja de trámite.<br>3. Copia de DNI.<br>4. Comprobante de pago correspondiente.<br><b>Plazo:</b> 2 a 5 días hábiles." 
    },

    // --- INSPECCIÓN Y CONTROL DE OBRAS (TUPA) ---
    { 
        tipo: "TUPA", 
        n: "Inspección Ocular de Obra", 
        p: "S/. 20.00", 
        icon: "fa-eye", 
        r: "1. Solicitud de inspección técnica.<br>2. Copia de DNI.<br>3. Comprobante de pago (S/. 20.00).<br>4. Documento de liquidación de derecho municipal de la obra.<br><b>Plazo:</b> 5 días hábiles." 
    },
    { 
        tipo: "TUPA", 
        n: "Control y Supervisión de Obra (Autoconstrucción)", 
        p: "S/. 30.00", 
        icon: "fa-hard-hat", 
        r: "• Obligatorio para ejecución por autoconstrucción.<br>1. Solicitud comunicando fecha de inicio.<br>2. Copia de DNI.<br>3. Comprobante de pago por supervisión (S/. 30.00).<br><b>Plazo:</b> 1 día hábil." 
    },
// --- LICENCIAS Y REVALIDACIONES DE OBRA (TUPA) ---
    { 
        tipo: "TUPA", 
        n: "Licencia de Obra: Autoconstrucción CON Planos (Proc. 58.1)", 
        p: "S/. 30.00", 
        icon: "fa-map-location", 
        r: "<b>Requisitos Completos:</b><br>" +
           "1. Formulario Único Oficial (parte 1) rubricado por propietario y abogado.<br>" +
           "2. Hoja de Trámite municipal correspondiente.<br>" +
           "3. Copia de DNI o carné de extranjería del administrado.<br>" +
           "4. Comprobante de pago por análisis y calificación (S/. 30.00).<br>" +
           "5. Copia simple de Certificado Literal o Título de Propiedad.<br>" +
           "6. Certificado de Habilitación Profesional (proyectistas y responsable).<br>" +
           "7. Certificado de Parámetros Urbanísticos y Edificatorios vigentes.<br>" +
           "8. Juego de Planos: Localización, Ubicación, Arquitectura, Estructuras, Sanitarias y Eléctricas.<br>" +
           "9. Fotografías a color del predio.<br>" +
           "10. Memoria Justificativa y Estudio de Impacto Ambiental.<br>" +
           "<b>Plazo:</b> 15 días hábiles." 
    },
    { 
        tipo: "TUPA", 
        n: "Licencia de Obra: Autoconstrucción SIN Planos (Proc. 58.2)", 
        p: "S/. 60.00", 
        icon: "fa-pen-ruler", 
        r: "<b>Requisitos Completos:</b><br>" +
           "1. Formulario Único Oficial (parte 1) rubricado por propietario y abogado.<br>" +
           "2. Hoja de Trámite municipal correspondiente.<br>" +
           "3. Copia de DNI o carné de extranjería del administrado.<br>" +
           "4. Comprobante de pago por análisis y calificación (S/. 60.00).<br>" +
           "5. Copia simple de Certificado Literal o Título de Propiedad.<br>" +
           "6. Lista detallada de los ambientes a construir (rubricada).<br>" +
           "<b>Plazo:</b> 15 días hábiles." 
    },
    { 
        tipo: "TUPA", 
        n: "Expedición de Licencia de Obra (Documento Oficial)", 
        p: "S/. 25.00 - 50.00", 
        icon: "fa-file-signature", 
        r: "<b>Requisitos Completos:</b><br>" +
           "1. Solicitud dirigida al Gerente de Desarrollo Urbano (Art. 113 Ley 27444).<br>" +
           "2. Liquidación previa de derechos municipales de licencia de obra.<br>" +
           "3. Copia de DNI del solicitante.<br>" +
           "4. Pago según tipo: Nueva (S/. 50.00), Remodelación/Ampliación (S/. 40.00), Cercado (S/. 30.00), Obras Menores (S/. 25.00), Demolición (S/. 40.00), Autoconstrucción (S/. 25.00).<br>" +
           "<b>Plazo:</b> 5 días hábiles." 
    },
    { 
        tipo: "TUPA", 
        n: "Autenticación de Planos", 
        p: "S/. 50.00", 
        icon: "fa-stamp", 
        r: "1. Solicitud dirigida al Gerente de Desarrollo Urbano y Rural.<br>2. Copia de DNI o carné de extranjería.<br>3. Comprobante de pago por derecho de autenticación (S/. 50.00).<br><b>Plazo:</b> 5 días hábiles." 
    },
    { 
        tipo: "TUPA", 
        n: "Reparación por Deterioro de Pistas y Veredas", 
        p: "S/. 10.00 / ML", 
        icon: "fa-road-barrier", 
        r: "• Aplicable a excavaciones para red de agua y desagüe.<br>1. Documento de notificación de liquidación de derecho municipal de obra.<br>2. Notificación de liquidación de derecho municipal de obra.<br>3. Copia de DNI.<br>4. Pago de S/. 10.00 por cada metro lineal (ML).<br><b>Plazo:</b> 1 día (Aprobación automática)." 
    },
    { 
        tipo: "TUPA", 
        n: "Revalidación de Licencia de Obra", 
        p: "S/. 25.00", 
        icon: "fa-calendar-plus", 
        r: "1. Solicitud dirigida al Gerente de Desarrollo Urbano y Rural.<br>2. Copia de DNI o carné de extranjería del administrado.<br>3. Comprobante de pago por revalidación (S/. 25.00).<br><b>Plazo:</b> 10 días hábiles." 
    },
    // --- SUBDIVISIÓN, ACUMULACIÓN Y HABILITACIÓN (TUPA) ---
    { 
        tipo: "TUPA", 
        n: "Subdivisión de Lote (Procedimiento 66)", 
        p: "S/. 50.00", 
        icon: "fa-scissors", 
        r: "<b>Requisitos Completos:</b><br>" +
           "1. Solicitud dirigida al Gerente de Desarrollo Urbano y Rural (Art. 113 Ley 27444).<br>" +
           "2. Comprobante de pago por derecho de trámite de subdivisión (S/. 50.00).<br>" +
           "3. Fotocopia del DNI o carné de extranjería del administrado.<br>" +
           "4. Copia simple del Certificado Literal de Dominio o del Título de Propiedad.<br>" +
           "5. Certificado de Parámetros Urbanísticos y Edificatorios vigentes.<br>" +
           "6. Plano de Ubicación y Localización.<br>" +
           "7. Plano del lote a subdividir.<br>" +
           "8. Plano de la subdivisión señalando áreas, linderos y medidas perimétricas de cada lote resultante.<br>" +
           "9. Memoria descriptiva por cada lote resultante.<br>" +
           "10. Certificado de Habilitación Profesional del proyectista.<br>" +
           "<b>Plazo de resolución:</b> 15 días hábiles." 
    },
    { 
        tipo: "TUPA", 
        n: "Acumulación de Lotes (Procedimiento 67)", 
        p: "S/. 50.00", 
        icon: "fa-layer-group", 
        r: "<b>Requisitos Completos:</b><br>" +
           "1. Solicitud dirigida al Gerente de Desarrollo Urbano y Rural.<br>" +
           "2. Comprobante de pago por derecho de trámite de acumulación (S/. 50.00).<br>" +
           "3. Fotocopia del DNI o carné de extranjería del administrado.<br>" +
           "4. Copia simple del Certificado Literal de Dominio o del Título de Propiedad de los lotes a acumular.<br>" +
           "5. Certificado de Parámetros Urbanísticos y Edificatorios vigentes.<br>" +
           "6. Plano de Ubicación y Localización.<br>" +
           "7. Plano de los lotes a acumular.<br>" +
           "8. Plano del lote acumulado señalando áreas, linderos y medidas perimétricas.<br>" +
           "9. Memoria descriptiva del lote resultante.<br>" +
           "10. Certificado de Habilitación Profesional del proyectista.<br>" +
           "<b>Plazo de resolución:</b> 15 días hábiles." 
    },
    { 
        tipo: "TUPA", 
        n: "Aprobación de Proyecto de Habilitación Urbana (Procedimiento 68)", 
        p: "S/. 200.00", 
        icon: "fa-map-location-dot", 
        r: "<b>Requisitos Completos:</b><br>" +
           "1. Solicitud dirigida al Alcalde (Art. 113 Ley 27444).<br>" +
           "2. Comprobante de pago de la liquidación de derechos municipales (S/. 200.00).<br>" +
           "3. Fotocopia del DNI del administrado.<br>" +
           "4. Certificado de Zonificación y Vías.<br>" +
           "5. Certificado de Factibilidad de Servicios (Agua, Alcantarillado y Energía Eléctrica).<br>" +
           "6. Copia simple del Título de Propiedad del terreno.<br>" +
           "7. Plano de Ubicación y Localización del terreno.<br>" +
           "8. Plano Perimétrico y Topográfico.<br>" +
           "9. Plano de Trazado y Lotización.<br>" +
           "10. Plano de Ornamentación de Parques (cuando se requiera).<br>" +
           "11. Memoria Descriptiva.<br>" +
           "12. Estudios Especiales (Impacto Ambiental y/o Vulnerabilidad, según el caso).<br>" +
           "13. Certificado de Habilitación Profesional de los proyectistas.<br>" +
           "<b>Plazo de resolución:</b> 45 días hábiles." 
    },
    // --- SERVICIOS DE AGUA Y TANQUE (TUSNE) ---
    { 
        tipo: "TUSNE", 
        n: "Venta de Agua por Tanque", 
        p: "S/. 5.00 - 15.00", 
        icon: "fa-truck-water", 
        r: "• Hasta 1000 m³: S/. 5.00.<br>• Hasta 2000 m³: S/. 10.00.<br>• Más de 2000 m³: S/. 15.00." 
    },
    { 
        tipo: "TUSNE", 
        n: "Reconexión del Servicio de Agua", 
        p: "S/. 20.00", 
        icon: "fa-faucet-drip", 
        r: "1. Recibo de pago de derecho de reconexión.<br>2. No mantener deudas pendientes con el servicio." 
    },

    // --- ALQUILERES DE EQUIPOS Y ESPACIOS (TUSNE) ---
    { 
        tipo: "TUSNE", 
        n: "Alquiler de Auditorio Municipal", 
        p: "S/. 20.00 - 30.00", 
        icon: "fa-building-user", 
        r: "• Turno Noche + Electricidad: S/. 30.00.<br>• Turno Día + Electricidad: S/. 20.00." 
    },
    
    { 
        tipo: "TUSNE", 
        n: "Servicio de Furgón (Vuelta)", 
        p: "S/. 10.00", 
        icon: "fa-truck-ramp-box", 
        r: "• Costo por vuelta en los alrededores del pueblo." 
    },

    // --- VENTA DE PRODUCTOS Y RECICLAJE (TUSNE) ---
    { 
        tipo: "TUSNE", 
        n: "Venta de Abono Orgánico (PETAR)", 
        p: "S/. 0.50 / Kg", 
        icon: "fa-seedling", 
        r: "• Venta por kilo directamente en la planta de tratamiento." 
    },
    { 
        tipo: "TUSNE", 
        n: "Venta de Residuos Sólidos (Reciclaje)", 
        p: "S/. 0.20 - 0.50", 
        icon: "fa-recycle", 
        r: "• Botellas plásticas: S/. 0.50 el kilo.<br>• Fierros: S/. 0.20 el kilo." 
    },

    // --- OFICINA DE ABASTECIMIENTO Y LOGÍSTICA (TUSNE) ---
    { tipo: "TUSNE", n: "Alquiler de Auditorio Eventos Culturales", p: "Ver detalle", icon: "fa-building-columns", r: "1. Solicitud.<br>2. Fotocopia Simple de DNI.<br>3. Recibo de Pago por Alquiler (por día):<br>• Con equipo de Sonido.<br>• Sin equipo de Sonido." },
    { tipo: "TUSNE", n: "Alquiler de Sonido", p: "S/. 150.00", icon: "fa-volume-high", r: "1. Solicitud.<br>2. Fotocopia Simple de DNI.<br>3. Recibo de Pago por Alquiler (por día)." },
    { tipo: "TUSNE", n: "Alquiler de sillas", p: "S/. 1.00", icon: "fa-chair", r: "1. Solicitud.<br>2. Fotocopia Simple de DNI.<br>3. Recibo de Pago por Alquiler (por día/unidad)." },
    { tipo: "TUSNE", n: "Alquiler de bancas", p: "S/. 1.50", icon: "fa-couch", r: "1. Solicitud.<br>2. Fotocopia Simple de DNI.<br>3. Recibo de Pago por Alquiler (por día)." },
    { tipo: "TUSNE", n: "Alquiler de Toldo (cada uno)", p: "S/. 30.00", icon: "fa-tent", r: "1. Solicitud.<br>2. Fotocopia Simple de DNI.<br>3. Recibo de Pago por Alquiler (por día)." },
    { tipo: "TUSNE", n: "Alquiler de mesas de madera", p: "S/. 10.00", icon: "fa-table", r: "1. Solicitud.<br>2. Fotocopia Simple de DNI.<br>3. Recibo de Pago por Alquiler (por día)." },
    { tipo: "TUSNE", n: "Alquiler de proyector", p: "S/. 20.00", icon: "fa-video", r: "1. Solicitud.<br>2. Fotocopia Simple de DNI.<br>3. Recibo de Pago por Alquiler (por día)." },
    { tipo: "TUSNE", n: "Alquiler de Motofurgón", p: "S/. 20.00", icon: "fa-truck-pickup", r: "1. Solicitud.<br>2. Fotocopia Simple de DNI.<br>3. Recibo de Pago por Alquiler (por día)." },
    { tipo: "TUSNE", n: "Alquiler de Fumigadora", p: "S/. 20.00", icon: "fa-spray-can-sparkles", r: "1. Solicitud.<br>2. Fotocopia Simple de DNI.<br>3. Recibo de Pago por Alquiler (por día)." },
    { tipo: "TUSNE", n: "Alquiler de Chaleadora (sin combustible)", p: "S/. 15.00", icon: "fa-scissors", r: "1. Solicitud.<br>2. Fotocopia Simple de DNI.<br>3. Recibo de Pago por Alquiler (por hora)." },

    // --- INFRAESTRUCTURA Y OBRAS ---
    { tipo: "TUSNE", n: "Fichas técnicas particulares", p: "S/. 500.00", icon: "fa-file-signature", r: "1. Solicitud.<br>2. Formato lleno.<br>3. Copia de DNI.<br>4. Recibo de pago." },
    { tipo: "TUSNE", n: "Visitas Técnicas particulares", p: "S/. 150.00", icon: "fa-helmet-safety", r: "1. Solicitud.<br>2. Formato lleno.<br>3. Copia de DNI.<br>4. Recibo de pago." },
    { tipo: "TUSNE", n: "Elaboración de documentos", p: "GRATUITO", icon: "fa-handshake-angle", r: "1. Solicitud verbal (Para beneficio del ciudadano)." },

    // --- CEMENTERIO ---
    { tipo: "TUSNE", n: "Entierro Adulto (Terreno)", p: "S/. 100.00", icon: "fa-monument", r: "1. Solicitud.<br>2. Partida de defunción.<br>3. Recibo de Pago.<br>• Dimensión: 2.5 M2." },
    { tipo: "TUSNE", n: "Entierro Niños (Terreno)", p: "S/. 50.00", icon: "fa-cross", r: "1. Solicitud.<br>2. Partida de defunción.<br>3. Recibo de Pago.<br>• Dimensión: 1.5 M2." },
    { tipo: "TUSNE", n: "Construcción de mausoleo", p: "S/. 50.00", icon: "fa-gopuram", r: "1. Solicitud.<br>2. Recibo de Pago." },
    { tipo: "TUSNE", n: "Exhumación de cadáveres", p: "S/. 300.00", icon: "fa-box-archive", r: "1. Solicitud.<br>2. Autorización Ministerio Público.<br>3. Recibo de Pago." },

    // --- DEPORTES ---

    { tipo: "TUSNE", n: "Estadio (Otras categorías)", p: "S/. 100.00", icon: "fa-futbol", r: "• Por día.<br>1. Solicitud.<br>2. DNI.<br>3. Recibo de Pago." },
    { tipo: "TUSNE", n: "Losa Deportiva (Eventos)", p: "S/. 150.00", icon: "fa-masks-theater", r: "• Eventos sociales/culturales.<br>1. Solicitud.<br>2. DNI.<br>3. Recibo de Pago." },

        // --- AGUA Y ALCANTARILLADO (ATM/UGSS) ---
    { tipo: "TUSNE", n: "Consumo Agua Mensual", p: "Desde S/. 5.00", icon: "fa-droplet", r: "• Doméstico: S/. 5.00<br>• Comercial: S/. 20.00<br>• Industrial: S/. 50.00" },
    { tipo: "TUSNE", n: "Multa: Instalación Clandestina", p: "S/. 100.00", icon: "fa-triangle-exclamation", r: "• Agua o alcantarillado sin autorización.<br>• Sujeto a corte inmediato." },
    { tipo: "TUSNE", n: "Multa: Desperdicio de Agua", p: "S/. 50.00", icon: "fa-water-ladder", r: "• Crianza de cerdos,Lavado de veredas, riego de calles o llenado de piscinas sin permiso" }
];
// 2. ACTUALIZA TU FUNCIÓN INIT
function init() {
    console.log("Iniciando componentes...");

    // Renderizado de Tasas
    const contenedorTasas = document.getElementById('listaTasas');
    
    if (contenedorTasas && typeof tasas !== 'undefined') {
        console.log("Cargando " + tasas.length + " trámites...");
        
        contenedorTasas.innerHTML = tasas.map(t => `
            <div class="p-6 rounded-[2.5rem] flex justify-between items-center shadow-sm bg-white border border-slate-100 mb-3 item-search">
                <div class="text-left">
                    <span class="px-2 py-0.5 rounded-full text-white text-[8px] font-black ${t.tipo === 'TUPA' ? 'bg-green-600' : 'bg-amber-500'}">${t.tipo}</span>
                    <h4 class="font-black text-[11px] uppercase mt-2 text-slate-800">${t.n}</h4>
                    <span class="text-green-600 font-black text-[13px]">${t.p}</span>
                </div>
                <button onclick="openTasaModal('${t.n.replace(/'/g, "\\'")}', '${t.r ? t.r.replace(/'/g, "\\'") : ""}')" 
                        class="bg-slate-50 text-slate-800 px-4 py-2 rounded-xl text-[9px] font-black uppercase shadow-sm active:scale-90 transition">
                    Ver Info
                </button>
            </div>
        `).join('');
    } else {
        console.error("No se encontró el contenedor listaTasas o el array tasas");
    }

    // Cargar Oficinas y Agenda
    if (typeof mostrarOficinas === "function") mostrarOficinas();
    actualizarEstadoAtencion();
}

    function actualizarReloj() {
        const ahora = new Date();
        const opciones = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
        document.getElementById('txt-fecha').innerText = ahora.toLocaleDateString('es-ES', opciones);
        document.getElementById('txt-hora').innerText = ahora.toLocaleTimeString('es-ES', {hour12: false});
    }

    function switchTab(tab) {
        document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.getElementById(`view-${tab}`).classList.add('active');
        document.getElementById(`btn-${tab}`).classList.add('active');
        window.scrollTo({top: 0, behavior: 'smooth'});
    }

   function init() {
    // 1. Renderizar Agenda
    const contenedorAgenda = document.getElementById('listaAgenda');
    if (contenedorAgenda && typeof agenda !== 'undefined') {
        contenedorAgenda.innerHTML = agenda.map((e, idx) => `
            <div onclick="openAgendaModal(${idx})" class="bg-white p-6 rounded-[2.5rem] flex items-center shadow-md border-l-8 cursor-pointer active:scale-95 transition mb-3" style="border-color: ${e.color}">
                <div class="text-center pr-5 border-r min-w-[70px]">
                    <span class="block text-2xl font-black text-slate-800 leading-none">${e.d}</span>
                    <span class="block text-[10px] font-black uppercase" style="color: ${e.color}">${e.m}</span>
                </div>
                <div class="ml-5 text-left">
                    <h4 class="text-[11px] font-black uppercase italic text-slate-700">${e.t}</h4>
                    <p class="text-[9px] text-slate-400 font-bold mt-1"><i class="fa-solid fa-clock mr-1"></i>${e.h}</p>
                </div>
            </div>
        `).join('');
    }

    // 1. PRIMERO: Los datos (Array de Tasas)
const tasas = [
    { n: "DERECHO DE AGUA POTABLE", p: "S/ 5.00", tipo: "TUSNE", r: "Pago mensual en ventanilla." },
    { n: "CONSTANCIA de POSESIÓN", p: "S/ 30.00", tipo: "TUPA", r: "1. Solicitud FUT<br>2. Copia de DNI<br>3. Acta de colindantes." }
    // ... agrega el resto aquí
];

// 2. SEGUNDO: La función de renderizado
function renderTasasFijas() {
    console.log("Intentando renderizar tasas..."); // Debug en consola
    const contenedor = document.getElementById('listaTasas');
    
    if (!contenedor) {
        console.error("Error: No se encontró el div 'listaTasas' en el HTML.");
        return;
    }

    contenedor.innerHTML = tasas.map(t => `
        <div class="p-6 rounded-[2.5rem] flex justify-between items-center shadow-sm bg-white border border-slate-100 mb-3 item-search">
            <div class="text-left">
                <span class="px-2 py-0.5 rounded-full text-white text-[8px] font-black ${t.tipo === 'TUPA' ? 'bg-green-600' : 'bg-amber-500'}">${t.tipo}</span>
                <h4 class="font-black text-[11px] uppercase mt-2 text-slate-800">${t.n}</h4>
                <span class="text-green-600 font-black text-[13px]">${t.p}</span>
            </div>
            <button onclick="openTasaModal('${t.n.replace(/'/g, "\\'")}', '${t.r ? t.r.replace(/'/g, "\\'") : ""}')" 
                    class="bg-slate-50 text-slate-800 px-4 py-2 rounded-xl text-[9px] font-black uppercase shadow-sm active:scale-90 transition">
                Ver Info
            </button>
        </div>
    `).join('');
}

// 3. TERCERO: Ejecutar al cargar la página
window.addEventListener('DOMContentLoaded', () => {
    renderTasasFijas();
});

    // 3. Renderizar Oficinas
    if (typeof mostrarOficinas === "function") {
        mostrarOficinas(); 
    }

    // 4. Actualizar estado de atención global
    actualizarEstadoAtencion();
}

    // Lógica de Modales
    function openAgendaModal(idx) {
        const e = agenda[idx];
        document.getElementById('modalTitulo').innerText = e.t;
        document.getElementById('modalCuerpo').innerHTML = `<p><b>Hora:</b> ${e.h}</p><p><b>Lugar:</b> ${e.l}</p><div class="bg-slate-50 p-4 rounded-2xl mt-4 border-l-4 border-institucional">${e.dsc}</div>`;
        document.getElementById('modalInfo').classList.add('active');
    }

    function openTasaModal(t, r) {
        document.getElementById('modalTitulo').innerText = t;
        let textoLimpio = r.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '').trim();
        document.getElementById('modalCuerpo').innerHTML = `
            <p class="text-[10px] font-black uppercase text-slate-400 mb-2">Requisitos:</p>
            <div class="bg-slate-50 p-4 rounded-2xl mb-4 text-left text-[11px] leading-relaxed">${r}</div>
            <button id="btnWS" class="w-full bg-[#25D366] text-white py-4 rounded-2xl font-black uppercase text-[10px] flex items-center justify-center gap-2 shadow-lg active:scale-95 transition">
                <i class="fa-brands fa-whatsapp text-lg"></i> Compartir Requisitos
            </button>`;
        document.getElementById('btnWS').onclick = () => compartirPorWhatsApp(t, textoLimpio);
        document.getElementById('modalInfo').classList.add('active');
    }

    function compartirPorWhatsApp(titulo, requisitos) {
        const msj = `*MUNI SAN ROQUE DE CUMBAZA*\n\n📌 *Trámite:* ${titulo.toUpperCase()}\n\n📝 *Requisitos:*\n${requisitos}\n\n⚠️ _Todo trámite es presencial._\n🌐 _Portal Digital_`;
        window.open("https://api.whatsapp.com/send?text=" + encodeURIComponent(msj), '_blank');
    }

    function closeModal() { document.getElementById('modalInfo').classList.remove('active'); }

    function filterData() {
        let input = document.getElementById('searchInput').value.toLowerCase();
        document.querySelectorAll('.item-search').forEach(item => {
            item.style.display = item.innerText.toLowerCase().includes(input) ? "flex" : "none";
        });
    }

    // --- FUNCIÓN DE CONTROL DE HORARIOS (ACTUALIZADA) ---
    function actualizarEstadoAtencion() {
        const ahora = new Date();
        const horaDecimal = ahora.getHours() + ahora.getMinutes() / 60;
        const diaSemana = ahora.getDay(); 

        const inicioAtencion = 7.5; // 7:30 AM
        const finAtencion = 15.5;   // 3:30 PM

        const estaAbierto = (diaSemana >= 1 && diaSemana <= 5 && horaDecimal >= inicioAtencion && horaDecimal <= finAtencion);

        // 1. Controlar botones de Oficinas
        document.querySelectorAll('.btn-wa-oficina').forEach(btn => {
            btn.style.backgroundColor = estaAbierto ? "#22c55e" : "#ef4444";
            btn.style.pointerEvents = estaAbierto ? "auto" : "none";
            btn.style.opacity = estaAbierto ? "1" : "0.7";
        });

        // 2. Controlar botón de Reporte Ciudadano (NUEVO)
        const btnReporte = document.querySelector('#view-ayuda a');
        if (btnReporte) {
            btnReporte.style.backgroundColor = estaAbierto ? "#25D366" : "#ef4444";
            btnReporte.style.pointerEvents = estaAbierto ? "auto" : "none";
            btnReporte.style.opacity = estaAbierto ? "1" : "0.7";
            btnReporte.innerHTML = estaAbierto 
                ? '<i class="fa-brands fa-whatsapp text-2xl"></i> Enviar a WhatsApp'
                : '<i class="fa-solid fa-clock text-2xl"></i> Fuera de Horario';
        }

        // 3. Actualizar Indicadores Visuales
        const dot = document.getElementById('status-icon');
        const text = document.getElementById('status-text');
        const msgBienvenida = document.getElementById('msg-bienvenida');

        if (dot && text && msgBienvenida) {
            dot.className = estaAbierto ? 'status-dot dot-online' : 'status-dot dot-offline';
 
 
            text.style.color = estaAbierto ? '#16a34a' : '#ef4444';
            msgBienvenida.innerText = estaAbierto 
                ? "¡Buen día, vecino! Estamos listos para atenderle." 
                : "Gracias por visitarnos. El horario de atención es Lunes - Viernes de 7:30 AM a 3:30 PM.";
        }
    }

  window.onload = () => {
    // 1. Quitar el cargando después de 800ms
    setTimeout(() => {
        const loader = document.getElementById('loading-screen');
        if(loader) {
            loader.classList.add('fade-out');
            setTimeout(() => loader.style.display = 'none', 500);
        }
    }, 800);

    // 2. Ejecutar funciones lógicas
    actualizarReloj();
    if (typeof mostrarOficinas === "function") mostrarOficinas(); 
    
    // --- IMPORTANTE: LLAMAR A LAS TASAS ---
    renderTasasFijas(); 
    // --------------------------------------

    actualizarEstadoAtencion();

    // 3. Iniciar intervalos
    setInterval(actualizarReloj, 1000);
    setInterval(actualizarEstadoAtencion, 60000);
};
    // 1. Configuración con tu URL de Firebase
const firebaseConfig = {
    apiKey: "AIzaSyDMR-7Gd45RVckl2XE80wKrqoXb2rncsIA",
    databaseURL: "https://muni-san-roque-default-rtdb.firebaseio.com", // Tu URL real
    projectId: "muni-san-roque"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// 2. Escuchar la Agenda (Evento 1)
db.ref('agenda/evento1').on('value', (snapshot) => {
    const data = snapshot.val();
    if (data) {
        // Buscamos el contenedor donde se muestran las actividades
        const lista = document.getElementById('listaAgenda');
        lista.innerHTML = `
            <div class="bg-white rounded-[2rem] p-6 shadow-sm border-l-8 flex items-center gap-5 border-orange-500">
                <div class="text-center min-w-[50px]">
                    <p class="text-2xl font-black text-slate-800 leading-none">${data.dia}</p>
                    <p class="text-[10px] font-black uppercase text-slate-400">${data.mes}</p>
                </div>
                <div class="text-left">
                    <p class="text-[9px] font-black uppercase text-slate-400 mb-1">
                        <i class="fa-solid fa-clock mr-1"></i> ${data.hora}
                    </p>
                    <h4 class="font-black text-slate-800 uppercase italic text-sm leading-tight">${data.titulo}</h4>
                </div>
            </div>
        `;
    }
});


 // 1. TU LISTA DE OFICINAS (Actualizada con IDs para Firebase)
const oficinas = [
    { 
        nombre: "Gerencia y Secretaría", 
        subs: [
            { id: "secretaria", n: "Secretaría General", e: "Responsable: Llorbith Fasabi", tel: "51956532742", msg: "Hola, deseo realizar una consulta a Secretaría." }
        ] 
    },
    { 
        nombre: "Administración y Rentas", 
        subs: [
            { id: "rentas", n: "Oficina de Rentas", e: "Responsable: Brayan Vela", tel: "51969356686", msg: "Hola, consulto sobre mis tributos/arbitrios." },
            { id: "mesapartes", n: "Mesa de Partes", e: "Responsable: Brayan Vela", tel: "51969356686", msg: "Hola, tengo un trámite para Mesa de Partes." }
        ] 
    },
    { 
        nombre: "Desarrollo Social y Humano", 
        subs: [
            { id: "sisfoh", n: "ULE - SISFOH", e: "Responsable: Jessica Vasquez", tel: "51978757404", msg: "Hola, consulto sobre mi empadronamiento SISFOH." },
            { id: "pvl", n: "Vaso de Leche (PVL)", e: "Responsable: Fabiana Diaz", tel: "51961518855", msg: "Hola, Información sobre el Programa Vaso de Leche." },
            { id: "defensa", n: "Defensa Civil", e: "Responsable: Jhonny  ", tel: "51973446958", msg: "Hola, Consulta sobre Defensa Civil." },
            { id: "omaped", n: "OMAPED y CIAM", e: "Responsable: -----", tel: "-------", msg: "Hola, Consulta sobre programas sociales OMAPED/CIAM." }
        ] 
    },


    { 
        nombre: "Planeamiento Urbano y Catastro", 
        subs: [
            { id: "infraestructura", n: "Oficina de Infraestructura", e: "Responsable: Diego Ramirez", tel: "51939350568", msg: "Hola, solicito información sobre." }
        ] 
    },
    { 
        nombre: "Servicios a la Ciudad", 
        subs: [
            { id: "agua", n: "Agua (ATM)", e: "Responsable: Luis Rojas", tel: "51949515908", msg: "Reporte o consulta sobre servicio de agua." }

        ] 
    }
];

// ==========================================
// 1. MOTOR DE OFICINAS (DIBUJO DE ESTRUCTURA)
// ==========================================
// ==========================================
// 1. MOTOR DE OFICINAS CON AUTO-CIERRE (3:30 PM)
// ==========================================
function mostrarOficinas() {
    const contenedor = document.getElementById('listaOficinas');
    if (!contenedor) return;

    // --- LÓGICA DE HORARIO CORREGIDA ---
    const ahora = new Date();
    const horaActualMinutos = (ahora.getHours() * 60) + ahora.getMinutes();
    
    const minutosApertura = (7 * 60) + 30; // 07:30 AM
    const minutosCierre = (15 * 60) + 30;   // 03:30 PM
    const esFinDeSemana = (ahora.getDay() === 0 || ahora.getDay() === 6);

    // NUEVA CONDICIÓN: Cerrado si es fin de semana O antes de las 7:30 O después de las 3:30
    const estaCerradoPorHora = esFinDeSemana || 
                               (horaActualMinutos < minutosApertura) || 
                               (horaActualMinutos >= minutosCierre);
    let html = "";
    oficinas.forEach(cat => {
        html += `<h3 class="text-[10px] font-black uppercase text-slate-400 mb-3 mt-6 ml-4 tracking-widest italic">${cat.nombre}</h3>`;
        cat.subs.forEach(sub => {
            // Si ya pasó la hora, forzamos el estado visual de "Cerrado"
            const textoEstado = estaCerradoPorHora ? "L-V: 7:30 AM - 3:30 PM" : "Sincronizando...";
            const colorEstado = estaCerradoPorHora ? "text-orange-500" : "text-slate-400";
            const claseBoton = estaCerradoPorHora ? "pointer-events-none opacity-20 grayscale" : "";
            const iconoBoton = estaCerradoPorHora ? "fa-moon" : "fa-whatsapp";

            html += `
                <div id="card-${sub.id}" class="bg-white p-5 rounded-[2rem] shadow-sm border border-slate-100 flex items-center justify-between mb-3 transition-all duration-500">
                    <div class="flex items-center gap-4 text-left">
                        <div id="icon-bg-${sub.id}" class="h-10 w-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400">
                            <i id="icon-i-${sub.id}" class="fa-solid ${estaCerradoPorHora ? 'fa-door-closed' : 'fa-door-open'}"></i>
                        </div>
                        <div>
                            <h4 class="text-sm font-black uppercase italic text-slate-800 leading-tight">${sub.n}</h4>
                            <p class="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">${sub.e}</p>
                            <div class="flex items-center gap-2 mt-1">
                                <span id="dot-${sub.id}" class="h-2 w-2 rounded-full ${estaCerradoPorHora ? 'bg-orange-400' : 'bg-slate-300'}"></span>
                                <span id="txt-${sub.id}" class="text-[9px] font-black uppercase italic ${colorEstado}">${textoEstado}</span>
                            </div>
                        </div>
                    </div>
                    <a href="https://wa.me/${sub.tel}?text=${encodeURIComponent(sub.msg)}" class="h-10 w-10 bg-green-100 text-green-600 rounded-full flex items-center justify-center active:scale-90 transition ${claseBoton}">
                        <i class="fa-brands ${iconoBoton} text-xl"></i>
                    </a>
                </div>`;
        });
    });

    contenedor.innerHTML = html;

    // Solo conectamos Firebase si NO es hora de cierre
    if (!estaCerradoPorHora) {
        setTimeout(() => {
            oficinas.forEach(cat => cat.subs.forEach(sub => vincularFirebaseOficina(sub.id)));
        }, 100);
    }
}
// ==========================================
// 2. CONEXIÓN REALTIME (LA QUE SÍ FUNCIONA)
// ==========================================
function vincularFirebaseOficina(id) {
    db.ref('oficinas/' + id).on('value', (snapshot) => {
        const data = snapshot.val();
        if (!data) return;

        const dot = document.getElementById('dot-' + id);
        const txt = document.getElementById('txt-' + id);
        const card = document.getElementById('card-' + id);
        const iconBg = document.getElementById('icon-bg-' + id);
        const iconI = document.getElementById('icon-i-' + id);

        if (dot && txt && card) {
            const online = data.estado === "SI";

            // Punto animado
            dot.className = `h-2 w-2 rounded-full ${online ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`;
            
            // Texto y Motivo
            txt.innerText = online ? "ATENDIENDO AHORA" : (data.motivo || "EN DESCANSO");
            txt.className = `text-[9px] font-black uppercase italic tracking-widest ${online ? 'text-green-600' : 'text-red-500'}`;
            
            // Borde lateral y fondo
            card.style.borderLeft = online ? '6px solid #22c55e' : '6px solid #ef4444';
            card.className = `bg-white p-5 rounded-[2rem] shadow-sm border flex items-center justify-between mb-3 transition-all duration-500 ${online ? 'border-green-100 bg-green-50/30' : 'border-red-50/30'}`;

            // Icono de la puerta (Abierta/Cerrada)
            if (iconBg && iconI) {
                iconBg.className = `h-10 w-10 rounded-xl flex items-center justify-center ${online ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-500'}`;
                iconI.className = `fa-solid ${online ? 'fa-door-open' : 'fa-door-closed'}`;
            }
        }
    });
}
    
    
    
    
    
  // 2. Función de inicio consolidada (CORREGIDA)
    function init() {
        // 1. Dibujamos la estructura de oficinas
        if (typeof mostrarOficinas === "function") {
            mostrarOficinas(); 
        }

        // 2. Renderizamos las Tasas (Usamos el nombre correcto: renderTasasFijas)
        if (typeof renderTasasFijas === "function") {
            renderTasasFijas();
        }

        // 3. Verificamos el horario general una vez al inicio
        if (typeof actualizarEstadoAtencion === "function") {
            actualizarEstadoAtencion();
        }
    }

    // 3. Control de carga y tiempos de ejecución
    window.onload = () => {
        const loader = document.getElementById('loading-screen');
        if (loader) {
            setTimeout(() => {
                loader.classList.add('fade-out');
                setTimeout(() => loader.style.display = 'none', 500);
            }, 800);
        }
        
        // Ejecución de la lógica principal
        init(); 
        
        // --- INTERVALOS ---
        // Actualiza el estado global cada minuto
        if (typeof actualizarEstadoAtencion === "function") {
            setInterval(actualizarEstadoAtencion, 60000); 
        }
        
        // Actualiza el reloj cada segundo
        if (typeof actualizarReloj === "function") {
            actualizarReloj();
            setInterval(actualizarReloj, 1000);
        }
    };

// 4. MOTOR DE TASAS (ÚNICA VERSIÓN LIMPIA)
function renderTasasFijas() {
    const contenedor = document.getElementById('listaTasas');
    if (!contenedor) return;

    if (typeof tasas === 'undefined' || tasas.length === 0) {
        contenedor.innerHTML = "<div class='text-center py-10 text-slate-400 font-bold'>No se encontraron trámites.</div>";
        return;
    }

    let html = "";
    tasas.forEach(t => {
        const colorTipo = t.tipo === 'TUPA' ? 'bg-green-600' : 'bg-amber-500';
        
        html += `
            <div class="p-5 rounded-[2.5rem] flex justify-between items-center shadow-sm bg-white border border-slate-50 mb-3 item-search transition-all hover:shadow-md">
                <div class="flex items-center gap-4 text-left">
                    <div class="h-12 w-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 border border-slate-100">
                        <i class="fa-solid ${t.icon || 'fa-file-invoice'} text-lg"></i>
                    </div>
                    <div>
                        <span class="px-2 py-0.5 rounded-full text-white text-[8px] font-black ${colorTipo}">${t.tipo || 'TUPA'}</span>
                        <h4 class="font-black text-[11px] uppercase mt-1 text-slate-800 leading-tight">${t.n}</h4>
                        <span class="text-green-600 font-black text-[13px]">${t.p}</span>
                    </div>
                </div>
                <button onclick="openTasaModal('${t.n.replace(/'/g, "\\'")}', '${t.r ? t.r.replace(/'/g, "\\'") : ""}')" 
                        class="bg-slate-800 text-white px-5 py-2.5 rounded-xl text-[9px] font-black uppercase shadow-sm active:scale-90 transition-all">
                    Detalles
                </button>
            </div>`;
    });
    contenedor.innerHTML = html;
}

// --- MOTOR DE AGENDA DINÁMICA (REALTIME) ---
db.ref('agenda').on('value', (snapshot) => {
    const contenedor = document.getElementById('listaAgenda');
    if (!contenedor) return;
    const data = snapshot.val();

    if (!data) {
        contenedor.innerHTML = `
            <div class="col-span-full p-10 text-center opacity-40">
                <i class="fa-solid fa-calendar-day text-4xl mb-2 text-slate-300"></i>
                <p class="text-xs font-black uppercase italic tracking-widest text-slate-400">Sin actividades programadas</p>
            </div>`;
        return;
    }

    let html = "";
    snapshot.forEach((child) => {
        const ev = child.val();
        html += `
            <div class="bg-white p-5 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 flex items-center gap-5">
                <div class="bg-green-600 text-white p-4 rounded-3xl text-center min-w-[70px] shadow-lg shadow-green-200">
                    <span class="block text-2xl font-black leading-none">${ev.dia}</span>
                    <span class="text-[10px] font-black uppercase tracking-widest">${ev.mes}</span>
                </div>
                
                <div class="text-left flex-1">
                    <h4 class="text-slate-900 font-black text-sm uppercase leading-tight mb-2">${ev.titulo}</h4>
                    <div class="flex flex-col gap-1">
                        <div class="flex items-center gap-2">
                            <i class="fa-solid fa-clock text-green-500 text-[10px]"></i>
                            <span class="text-slate-500 text-[11px] font-bold">${ev.hora || 'Por confirmar'}</span>
                        </div>
                        <div class="flex items-center gap-2">
                            <i class="fa-solid fa-location-dot text-slate-300 text-[10px]"></i>
                            <span class="text-slate-400 text-[10px] font-medium italic">San Roque de Cumbaza</span>
                        </div>
                    </div>
                </div>
            </div>`;
    });
    contenedor.innerHTML = html;
});
function verificarHorarioGeneral() {
    const ahora = new Date();
    const minutosActuales = (ahora.getHours() * 60) + ahora.getMinutes();
    const diaSemana = ahora.getDay();

    const minutosApertura = (7 * 60) + 30; // 07:30 AM
    const minutosCierre = (15 * 60) + 30;   // 03:30 PM

    const esFinDeSemana = (diaSemana === 0 || diaSemana === 6);
    
    // Nueva validación de RANGO COMPLETO
    const debeEstarCerrado = esFinDeSemana || 
                             (minutosActuales < minutosApertura) || 
                             (minutosActuales >= minutosCierre);

    if (debeEstarCerrado) {
        oficinas.forEach(cat => {
            cat.subs.forEach(sub => {
                const card = document.getElementById('card-' + sub.id);
                const txt = document.getElementById('txt-' + sub.id);
                const dot = document.getElementById('dot-' + sub.id);
                const btn = document.querySelector(`#card-${sub.id} a`);
                const iconI = document.getElementById('icon-i-' + sub.id);

                if (card && txt && dot) {
                    // Mensaje amigable dependiendo de la situación
                    if (esFinDeSemana) {
                        txt.innerText = "¡DESCANSANDO! ATENDEMOS EL LUNES 07:30 AM";
                    } else if (minutosActuales < minutosApertura) {
                        txt.innerText = "¡PRONTO! HOY ATENDEMOS DESDE LAS 07:30 AM";
                    } else {
                        txt.innerText = "¡HASTA MAÑANA! ATENDEMOS DESDE LAS 07:30 AM";
                    }

                    txt.className = "text-[8px] font-black uppercase italic text-orange-500 tracking-tighter";
                    dot.className = "h-2 w-2 rounded-full bg-orange-400";
                    card.style.borderLeft = '6px solid #f97316'; 
                    card.classList.add('opacity-80');

                    if (iconI) iconI.className = "fa-solid fa-door-closed";

                    if (btn) {
                        btn.classList.add('pointer-events-none', 'grayscale', 'opacity-20');
                        btn.innerHTML = '<i class="fa-solid fa-moon"></i>'; 
                    }
                }
            });
        });
        return true; 
    }
    return false; 
}
// Función para escuchar el comunicado desde Firebase
function escucharComunicado() {
    const db = firebase.database();
    
    db.ref('aviso_urgente').on('value', (snapshot) => {
        const data = snapshot.val();
        const contenedor = document.getElementById('contenedor-aviso-urgente');
        const texto = document.getElementById('texto-aviso-vecino');

        if (data && data.mensaje && data.mensaje.trim() !== "") {
            // Si hay mensaje, lo mostramos con el texto de Firebase
            texto.innerText = data.mensaje;
            contenedor.classList.remove('hidden');
        } else {
            // Si el mensaje está vacío en Firebase, ocultamos el cuadro
            contenedor.classList.add('hidden');
        }
    });
}

// Llama a la función al cargar la página
window.addEventListener('load', escucharComunicado);
// Ejecuta la validación apenas carga la web
window.addEventListener('load', controlarHorario);

// Revisa el reloj automáticamente cada 60 segundos
setInterval(controlarHorario, 60000);

    // Dentro del <script> de la Web del Vecino
const messaging = firebase.messaging();

function activarNotificaciones() {
    // 1. Pedir permiso al vecino
    messaging.requestPermission()
        .then(() => {
            console.log('Permiso concedido');
            // 2. Obtener el Token (el "ID" único del celular del vecino)
            return messaging.getToken();
        })
        .then((token) => {
            console.log("Token del vecino:", token);
            
            // 3. Suscribir al vecino al nodo de notificaciones en tu Database
            // Esto servirá para que el Admin sepa a quién enviarle
            db.ref('tokens_notificaciones').child(token.substring(0, 20)).set(token);
        })
        .catch((err) => {
            console.log('Error al obtener permiso:', err);
        });
}

// Llamar a la función automáticamente al cargar la página
activarNotificaciones();
function controlarHorarioBanner() {
    const elementoBanner = document.getElementById('bannerPagoVirtual');
    if (!elementoBanner) return;

    const ahora = new Date();
    const diaSemana = ahora.getDay(); // 1=Lun, 5=Vie
    const horaActual = ahora.getHours();
    const minutosActuales = ahora.getMinutes();
    
    // Convertimos a minutos totales para precisión
    const totalMinutos = (horaActual * 60) + minutosActuales;
    const inicio = (7 * 60) + 30; // 07:30 AM
    const fin = (15 * 60) + 30;   // 03:30 PM

    // Lógica de validación
    const esDiaValido = (diaSemana >= 1 && diaSemana <= 5);
    const esHoraValida = (totalMinutos >= inicio && totalMinutos < fin);

    if (esDiaValido && esHoraValida) {
        elementoBanner.style.display = "block"; // Muestra el banner
    } else {
        elementoBanner.style.display = "none";  // Oculta el banner
    }
}

// Ejecutar al cargar la página
controlarHorarioBanner();

// Revisar cada 60 segundos por si el tiempo cambia mientras la app está abierta
setInterval(controlarHorarioBanner, 60000);

