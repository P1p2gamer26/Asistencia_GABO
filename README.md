# sistema-control-asistencia
Aplicación hecha en powerapps para la toma de asistencia en el colegio Gabriel Garcia Marquez
Pendientes y Mejoras: Sistema de Registro de Asistencia
Estado Actual: La aplicación ya filtra estudiantes por curso, permite marcar la asistencia (P, T, F, E) y guarda los registros en Excel con la hora local ajustada y el correo del profesor.
Estabilidad de Datos
Migración de Base de Datos: Actualmente se usa Excel. Se recomienda migrar a SharePoint Lists o Dataverse. El Excel causa errores de bloqueo si alguien más lo tiene abierto en el navegador y Power Apps no puede escribir en él.
Validación de Registros Duplicados: Implementar una lógica que impida guardar la asistencia dos veces para el mismo curso el mismo día. Actualmente, el botón Patch crea registros nuevos cada vez que se pulsa.
Tablas códigos: Crear nuevas tablas con la lista de estudiantes, fotos y códigos qr/barras para gestionar la asistencia al ingreso al colegio. Los código de la DB deben ser los que vengan en el carnet, no deben ser creados.
Agregar funcionalidad (Back-end)
Notificación evasión: Enviar una notificación al correo institucional de las coordinadoras con los estudiantes que sean marcados como “evadiendo clase” para seguir con el proceso respectivo
Notificación falta o llegada tarde: Enviar una notificación al correo de los padres cuando un estudiante llegue muy tarde a clase o falte.
Detalles estudiantes: Agregar en la tarjeta de cada estudiante la opción de buscar más información del estudiante, como teléfono, dirección y eps.
Experiencia de Usuario (UI/UX)
Pantalla de Confirmación/Historial: Crear una vista donde el profesor pueda ver qué cursos ya marcaron asistencia hoy para evitar olvidos.
Pantalla Consulta: Crear una pantalla donde los profesores puedan consultar información de diferentes cursos o estudiantes y obtener reportes sobre la asistencia
