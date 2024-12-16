require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const multer = require('multer');
const xlsx = require('xlsx');
const bcrypt = require('bcrypt');
const path = require('path');
const session = require('express-session');
const app = express();
const bodyParser = require('body-parser');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const upload = multer({ dest: 'uploads/' });

// Configuración de puerto
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor en funcionamiento en el puerto ${PORT}`));


// Configuración de MySQL
const connection = mysql.createConnection({
  host: process.env.DB_HOST,       // Host desde .env
  user: process.env.DB_USER,       // Usuario desde .env
  password: process.env.DB_PASSWORD,   // Contraseña desde .env
  database: process.env.DB_NAME    // Nombre de la base de datos desde .env
});

connection.connect(err => {
  if (err) throw err;
  console.log('Conectado a la base de datos');
});

// Configuración de Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());


// Configuración de la sesión
app.use(session({
  secret: 'secretKey',
  resave: false,
  saveUninitialized: false,
}));


{//Funciones de la sesion registro login logout requiererol tipousuario

// Registro de usuario
app.post('/registrar', async (req, res) => {
  const { nombre_usuario, password, codigo_acceso } = req.body;
  const passwordHash = await bcrypt.hash(password, 10);

  const query = 'SELECT tipo_usuario FROM codigos_acceso WHERE codigo = ?';
  connection.query(query, [codigo_acceso], (err, results) => {
    if (err || results.length === 0) {
            return res.send('Código de acceso inválido');
        }
    const tipo_usuario = results[0].tipo_usuario;
    connection.query('INSERT INTO usuarios (nombre_usuario, password_hash, tipo_usuario) VALUES (?, ?, ?)', 
    [nombre_usuario, passwordHash, tipo_usuario], (err) => {
      if (err) {
      return res.send('Error al registrar el usuario.');
      }
    res.redirect('/login.html');
    });
  });
});


// Iniciar sesión
app.post('/login', (req, res) => {
  const { nombre_usuario, password } = req.body;

  connection.query('SELECT * FROM usuarios WHERE nombre_usuario = ?', 
    [nombre_usuario], async (err, results) => {
    if (err || results.length === 0) {
      return res.send('Usuario no encontrado.');
    }

    const user = results[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (match) {
    req.session.userId = user.id;
    req.session.nombre_usuario = user.nombre_usuario;
    req.session.tipo_usuario = user.tipo_usuario;
     
      res.redirect('/');
    } else {
      res.send('Contraseña incorrecta.');
    }
  });
});

// Cerrar sesión
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login.html');
});

function requireLogin(req, res, next) {
  if (!req.session.userId) {
    return res.redirect('/login.html');
  }
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.session.userId && req.session.tipo_usuario == 'admin') {
      next();
    }
    else{
      if (req.session.userId && req.session.tipo_usuario === role) {
          next();
      }
      else {
        let html = `
      <html>
      <head>
        <link rel="stylesheet" href="/styles.css">
        <title>Acceso Denegado</title>
      </head>
      <body>
        <h1>Acceso denegado</h1>
        <h3>Para entrar en esta pagina necesita permisos especiales con los cuales no cuenta</h3>
       <br />
       <br />
       <button onclick="window.location.href='/'">Volver</button>
      </body>
      </html>
    `;

    res.send(html);
      }
    }
  };
}


// Ruta para obtener el tipo de usuario actual
app.get('/tipo-usuario', requireLogin, (req, res) => {
  res.json({ tipo_usuario: req.session.tipo_usuario });
});


  }


{//Funciones  de carga de archivos upload  download downland_receptores


  app.post('/upload', upload.single('excelFile'), (req, res) => {
    const filePath = req.file.path;
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
  
    data.forEach(row => {
      const { marca_id, dispositivo_id, modelo, numero_serie, fecha_in, tecnico_us, fecha_out  } = row;
      const sql = `INSERT INTO equipos (marca_id, dispositivo_id, modelo, numero_serie, fecha_in,tecnico_us, fecha_out) VALUES (?, ?, ? , ?, ?, ?, ? )`;
      connection.query(sql, [marca_id, dispositivo_id, modelo, numero_serie, fecha_in, tecnico_us, fecha_out], err => {
        if (err) throw err;
      });
    });
  
    res.send('<h1>Archivo cargado y datos guardados</h1><a href="/equipos.html">Volver</a>');
  });
  
  app.get('/download', (req, res) => {
    const sql = `SELECT * FROM equipos`;
    connection.query(sql, (err, results) => {
      if (err) throw err;
  
      const worksheet = xlsx.utils.json_to_sheet(results);
      const workbook = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(workbook, worksheet, 'Equipos');
  
      const filePath = path.join(__dirname, 'uploads', 'equipos.xlsx');
      xlsx.writeFile(workbook, filePath);
      res.download(filePath, 'equipos.xlsx');
    });
  });
 
  app.get('/vistapdf', (req, res) => {
    const sql = `SELECT * FROM vista_equiposmd`;
    connection.query(sql, (err, results) => {
      if (err) throw err;
  
      const worksheet = xlsx.utils.json_to_sheet(results);
      const workbook = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(workbook, worksheet, 'Equipos');
  
      const filePath = path.join(__dirname, 'uploads', 'vista.xlsx');
      xlsx.writeFile(workbook, filePath);
      res.download(filePath, 'equipos.xlsx');
    });
  });
 
  

app.get('/downloadpdf', requireLogin, requireRole('tecnico'), (req, res) => {
  const sql = 'SELECT * FROM equipos';
  connection.query(sql, (err, results) => {
    if (err) {
      console.error("Error al consultar la base de datos:", err);
      return res.status(500).send('Error al obtener los datos.');
    }
    const doc = new PDFDocument();
    const filePath = path.join(__dirname, 'equipos.pdf');
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);
    doc.text('ID').moveDown();
    doc.text('Id marca').moveDown();
    doc.text('Id dispositivo').moveDown();
    doc.text('Modelo').moveDown();
    doc.text('Numero de serie').moveDown();
    doc.text('Fecha de entrada').moveDown();
    doc.text('Tecnico encargado').moveDown();
    doc.text('Fecha de salida estimada').moveDown();
    results.forEach((area) => {
      doc.text([area.id], [area.marca_id] ,[area.dispositivo_id],[area.modelo],[area.numero_serie],[area.fecha_in],[area.tecnico_us],[area.fecha_out]).moveDown();
    });
    doc.end();
    stream.on('finish', () => {
      res.download(filePath, 'equipos.pdf', (err) => {
        if (err) {
          console.error('Error al descargar el archivo:', err);
          res.status(500).send('Error al descargar el archivo.');
        } else {
          fs.unlinkSync(filePath);
        }
      });
    });
  });
});



  
}


{//Paginas sin html

    //Ruta para error
app.get('/error',(req, res) => {
  let html = `
    <html>
    <head>
      <link rel="stylesheet" href="/styles.css">
      <title>Error</title>
    </head>
    <body>
<br/>

<h2>A ocurrido un error, disculpe las molestias</h2<>
<br/>

 <button onclick="window.location.href='/'">Volver a pagina de inicio</button>  
      </body>
    </html>
  `;

  res.send(html);
});


  //Ruta para tablas admin
app.get('/tablas', requireLogin, requireRole('admin'), (req, res) => {
  let html = `
    <html>
    <head>
      <link rel="stylesheet" href="/styles.css">
      <title>Administracion de Tablas</title>
    </head>
    <body>
<nav>
    <ul id="menu">       
        <li><a href="/">Inicio</a></li>
        <li><a href="/equipos.html">Equipos</a></li>
        <li><a href="/busqueda.html">Usuarios</a></li>
        <li><a href="/tablas">Gestionar Tablas</a></li>
        <li><a href="/logout">Cerrar Sesion</a></li>
    </ul>
</nav>   
<br/>
<form action="/actualizar_tabla" method="POST">
    <h2>Actualizar Tablas</h2>
    <label for="nombre_tabla">Nombre de la tabla:</label>
    <input type="text" id="nombre_tabla" name="nombre_tabla" required>
    <label for="nombre_columna">Nombre de la columna:</label>
    <input type="text" id="nombre_columna" name="nombre_columna" required>
    <label for="dato_nuevo">Dato nuevo:</label>
    <input type="text" id="dato_nuevo" name="dato_nuevo" required>
    <label for="identificador">Identificador de posicion:</label>
    <input type="text" id="identificador" name="identificador" required>
    <label for="dato_identificador">Dato de identificacion:</label>
    <input type="text" id="dato_identificador" name="dato_identificador" required>
    <button type="submit">Guardar Cambios</button>
  </form>
<br/>  

<form action="/alterar_tabla" method="POST">
  <h2>Alterar Tablas</h2>
     <label for="accion">Acción:</label>
  <select id="accion" name="accion">
    <option value="add">Agregar Columna</option>
    <option value="remove">Eliminar Columna</option>
  </select>
    <label for="nombre_tabla">Nombre de la tabla:</label>
    <input type="text" id="nombre_tabla" name="nombre_tabla" required>
    <label for="nombre_columna">Nombre de la columna:</label>
    <input type="text" id="nombre_columna" name="nombre_columna" required>
    <label for="tipo_dato">Tipo de dato (solo para agregar):</label>
    <input type="text" id="tipo_dato" name="tipo_dato">
    <button type="submit">Guardar Cambios</button>
  </form>

  <br/>

  
      </body>
    </html>
  `;

  res.send(html);
});


// Ruta para Marcas
app.get('/marcas', requireLogin, requireRole('tecnico'), (req, res) => {
  connection.query('SELECT * FROM marcas', (err, results) => {
    if (err) {
      return res.redirect('/error');
    }

    let html = `
      <html>
      <head>
        <link rel="stylesheet" href="/styles.css">
        <title>Marcas</title>
      </head>
      <body>
        <h1>Marcas Registradas</h1>
        <table>
          <thead>
            <tr>
              <th>Id</th>
              <th>Nombre</th>
            </tr>
          </thead>
          <tbody>
    `;

    results.forEach(marca => {
      html += `
        <tr>
          <td>${marca.id}</td>
          <td>${marca.nombre}</td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
        <button onclick="window.location.href='/equipos.html'">Volver</button>
      </body>
      </html>
    `;

    res.send(html);
  });
});

// Ruta para Dispositivos
app.get('/dispositivos', requireLogin, requireRole('tecnico'), (req, res) => {
  connection.query('SELECT * FROM dispositivos', (err, results) => {
    if (err) {
      return res.redirect('/error');
    }

    let html = `
      <html>
      <head>
        <link rel="stylesheet" href="/styles.css">
        <title>Dispositivos</title>
      </head>
      <body>
        <h1>Dispositivos Registrados</h1>
        <table>
          <thead>
            <tr>
              <th>Id</th>
              <th>Nombre</th>
            </tr>
          </thead>
          <tbody>
    `;

    results.forEach(marca => {
      html += `
        <tr>
          <td>${marca.id}</td>
          <td>${marca.nombre}</td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
        <button onclick="window.location.href='/equipos.html'">Volver</button>
      </body>
      </html>
    `;

    res.send(html);
  });
});


// Ruta para Dispositivos
app.get('/equipos', requireLogin, requireRole('tecnico'), (req, res) => {
  connection.query('SELECT * FROM equipos', (err, results) => {
    if (err) {
      return res.redirect('/error');
    }

    let html = `
      <html>
      <head>
        <link rel="stylesheet" href="/styles.css">
        <title>Equipos</title>
      </head>
      <body>
        <h1>Equipos Registrados</h1>
        <table>
          <thead>
            <tr>
              <th>Id</th>
              <th>Id de marca</th>
              <th>Id de dispositivo</th>
              <th>Modelo</th>
              <th>Numero de serie</th>
              <th>Fecha de ingreso</th>
              <th>Tecnico a cargo</th>
              <th>Fecha de salida estimada</th>
            </tr>
          </thead>
          <tbody>
    `;

    results.forEach(marca => {
      html += `
        <tr>
          <td>${marca.id}</td>
          <td>${marca.marca_id}</td>
          <td>${marca.dispositivo_id}</td>
          <td>${marca.modelo}</td>
          <td>${marca.numero_serie}</td>
          <td>${marca.fecha_in}</td>
          <td>${marca.tecnico_us}</td>
          <td>${marca.fecha_out}</td>    
</tr>
      `;
    });

    html += `
          </tbody>
        </table>
        <button onclick="window.location.href='/vista'">Vista agregada</button>
        <button onclick="window.location.href='/download'">Descargar Excel</button>
<button onclick="window.location.href='/downloadpdf'">Descargar PDF</button>
        <button onclick="window.location.href='/equipos.html'">Volver</button>
      </body>
      </html>
    `;

    res.send(html);
  });
});


// Ruta para Dispositivos
app.get('/vista', requireLogin, requireRole('tecnico'), (req, res) => {
  connection.query('SELECT * FROM vista_equiposmd', (err, results) => {
    if (err) {
      return res.redirect('/error');
    }

    let html = `
      <html>
      <head>
        <link rel="stylesheet" href="/styles.css">
        <title>Equipos</title>
      </head>
      <body>
        <h1>Equipos Registrados</h1>
        <table>
          <thead>
            <tr>
              <th>Marca</th>
              <th>Dispositivo</th>
              <th>Modelo</th>
              <th>Numero de serie</th>
              <th>Fecha de ingreso</th>
              <th>Tecnico a cargo</th>
              <th>Fecha de salida estimada</th>
            </tr>
          </thead>
          <tbody>
    `;

    results.forEach(marca => {
      html += `
        <tr>
          <td>${marca.marca}</td>
          <td>${marca.dispositivo}</td>
          <td>${marca.modelo}</td>
          <td>${marca.numero_serie}</td>
          <td>${marca.fecha_in}</td>
          <td>${marca.tecnico_us}</td>
          <td>${marca.fecha_out}</td>    
</tr>
      `;
    });

    html += `
          </tbody>
        </table>
        <button onclick="window.location.href='/vistaexcel'">Excel</button>
        <button onclick="window.location.href='/equipos'">Volver</button>
      </body>
      </html>
    `;

    res.send(html);
  });
});




}


{//Funciones admin buscar eliminar_usuario alterar_tablas

//buscar usuarios en tiempo real
app.get('/buscar', requireLogin, requireRole('admin'), (req, res) => {
  const query = req.query.query;
  const sql = `SELECT id, nombre_usuario FROM usuarios WHERE nombre_usuario LIKE ?`;
  connection.query(sql, [`%${query}%`], (err, results) => {
    if (err) throw err;
    res.json(results);
  });
});
  
  //Ruta para eliminar usuario
  app.post('/eliminar_usuario', requireLogin, requireRole('admin'), (req, res) => {
    const {id} = req.body;
  
    const query = 'DELETE FROM usuarios WHERE id= ? ';
    connection.query(query, [id], (err, result) => {
      if (err) {
        return res.send('Error al eliminar al usuario.');
      }
      res.redirect('/usuarios');
    });
  });

// Ruta de administrador para poder alterar tablas
app.post('/alterar_tabla', requireLogin, requireRole('admin'), (req, res) => {
  const { accion, nombre_tabla, nombre_columna, tipo_dato } = req.body;
 
  if (accion === 'add') {
    query = 'ALTER TABLE ?? ADD ?? INT'; 
      connection.query(query, [nombre_tabla, nombre_columna,tipo_dato], (err, result) => {
       if (err) {
         console.error(err);
         return res.redirect('/error');
       }
       res.redirect('/tablas');
     });
   } else 
 if (accion === 'remove') {
     query = 'ALTER TABLE ?? DROP COLUMN ??;';
     connection.query(query, [nombre_tabla, nombre_columna], (err, result) => {
       if (err) {
         console.error(err);
         return res.redirect('/error');
       }
       res.redirect('/tablas');
     });
   } else {
     return res.redirect('/error');
   }
 });


}


{//Rutas para las tablas actualizar tabla, insertar datos insertar equipos eliminar mde

 //Ruta para poder actualizar datos de tablas
 app.post('/actualizar_tabla', requireLogin, requireRole('tecnico'), (req, res) => {
  const {nombre_tabla,nombre_tablatt, nombre_columna, dato_nuevo, identificador, dato_identificador } = req.body;
  
  if (nombre_tablatt === 'marcas') {
    query = 'UPDATE asd SET ?? = ? WHERE ?? = ?;';
     connection.query(query,[nombre_columna, dato_nuevo, identificador, dato_identificador], (err, result) => {
       if (err) {
         return res.redirect('/error');
       }
       res.redirect('/equipos.html');
     });
   }
 if (nombre_tablatt === 'dispositivos') {
    query = 'UPDATE dispositivos SET ?? = ? WHERE ?? = ?;';
     connection.query(query,[nombre_columna, dato_nuevo, identificador, dato_identificador], (err, result) => {
       if (err) {
         return res.redirect('/error');
       }
       res.redirect('/equipos.html');
     });
   }
 if (nombre_tablatt === 'equipos') {
    query = 'UPDATE equipos SET ?? = ? WHERE ?? = ?;';
     connection.query(query,[nombre_columna, dato_nuevo, identificador, dato_identificador], (err, result) => {
       if (err) {
         return res.redirect('/error');
       }
       res.redirect('/equipos.html');
     });
   }
  if(req.session.tipo_usuario ==='admin'){
    query = 'UPDATE ?? SET ?? = ? WHERE ?? = ?;';
    connection.query(query,[nombre_tabla, nombre_columna, dato_nuevo, identificador, dato_identificador], (err, result) => {
      if (err) {
        return res.redirect('/error');
      }
      res.redirect('/tablas');
    });
  }
  });


// Insertar marcas
app.post('/insertar_datos', requireLogin, requireRole('tecnico'), (req, res) => {
  const {mardis, nombre} = req.body;
  if (mardis === 'marcas') {
    query = 'INSERT INTO marcas (nombre) VALUES (?);';
     connection.query(query,[nombre], (err, result) => {
       if (err) {
         return res.redirect('/error');
       }
       res.redirect('/equipos.html');
     });
   }
 if (mardis === 'dispositivos') {
    query = 'INSERT INTO dispositivos (nombre) VALUES (?);';
     connection.query(query,[nombre], (err, result) => {
       if (err) {
         return res.redirect('/error');
       }
       res.redirect('/equipos.html');
     });
   }
});


//Insetar equipos
app.post('/ins_equipos', requireLogin, requireRole('tecnico'), (req, res) => {
  const { marca, dispositivo, modelo, numeross, fechai, tecnico, fechao} = req.body;
  const query = 'INSERT INTO equipos (marca_id, dispositivo_id, modelo, numero_serie, fecha_in, tecnico_us, fecha_out) VALUES (?,?,?,?,?,?,?);';
  connection.query(query, [marca, dispositivo, modelo, numeross, fechai, tecnico, fechao], (err, result) => {
    if (err) {
      return res.redirect('/error');
    }
    res.redirect('/equipos.html');
  });
});


// Eliminar marcas dispositivos equipos
app.post('/eliminarmde', requireLogin, requireRole('tecnico'), (req, res) => {
  const {mde, idf, dato_idf} = req.body;
 if (mde === 'marcas') {
const query = 'DELETE FROM marcas WHERE ?? = ?';
connection.query(query, [idf, dato_idf], (err, result) => {
  if (err) {
        return res.redirect('/error');
      }
      res.redirect('/equipos.html');
    });
   }
 if (mde === 'dispositivos') {
const query = 'DELETE FROM dispositivos WHERE ?? = ?';
connection.query(query, [idf, dato_idf], (err, result) => {
  if (err) {
        return res.redirect('/error');
      }
      res.redirect('/equipos.html');
    });
   } 
if (mde === 'equipos') {
const query = 'DELETE FROM equipos WHERE ?? = ?';
connection.query(query, [idf, dato_idf], (err, result) => {
  if (err) {
        return res.redirect('/error');
      }
      res.redirect('/equipos.html');
    });
   }
});

}

