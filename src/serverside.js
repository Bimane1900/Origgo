let express = require('express'); // https://expressjs.com/en/guide/routing.html
let mysql = require('mysql');// https://www.npmjs.com/package/mysql
let bodyParser = require('body-parser');// https://www.npmjs.com/package/body-parser
let fs = require('fs'); // https://www.w3schools.com/nodejs/nodejs_filesystem.asp
let db = require('./DBinfo');

let app = express();
//sets connection to Database with the specifics given from DBinfo.js
let connection = mysql.createConnection(db.connectionstring);

//use for complex json parsing
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

//allows for navigation from exteral ip(gateway), not needed if ran on localhost
app.use(function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

//testing connection, sending a query to DB, This is gonna be wrapped in post request below
let DBresult = "";
connection.connect(); 
connection.query('SELECT name FROM origgo.tesssst WHERE id = 1;',  (error, results, fields) => {
  if (error) throw error;
  console.log('result from Database: on "SELECT name FROM origgo.tesssst WHERE id = 1;": ', results[0].name);
  DBresult = results[0].name;
});
connection.end();

//Post awaint requests, DB connection should be inside this but separeted for better understanding
let login = false;
app.post('/request',(req, res) =>{
  login = true;
  console.log("req.body: ",req.body,"req.query: ",req.query); 
  console.log("login: ",login);
  res.send(DBresult) //sends DB result,
});

//request to go to map site, only allowed if loged in 
app.get('/map.html', (req, res) => {
  if (login) {
    res.send(fs.readFileSync('../public/map.html', 'utf8'));
  }else{
    res.send(fs.readFileSync('../public/index.html', 'utf8'));
  }
});

/*Sends all airplanes data to client*/
app.get('/addAirplanes', (req, res) => {
  request("https://opensky-network.org/api/states/all", function(data){
    res.send(data);
  })
});

/*function for accessing WEB API through https module,
see it as serverside making requests to services*/
function request(link, func){
  let req = https.request(link, function(res){
    //console.log(res.statusCode);
    if(res.statusCode == 301){
      request(res.headers.location, func);
    }
    else if(res.statusCode == 200){
      let datastring = "";
      res.setEncoding('utf8');
      res.on('data', function(data){
        datastring += data;
      });
      res.on('end', function(){
        func(JSON.parse(datastring));
      })      
    }
  });
  req.end();
}

//sets static directory, "root" of homepage
app.use(express.static(__dirname + '/../public')); // if not this is given, give specific adress like : app.get('/', (req, res) => res.send(fs.readFileSync('./index.html', 'utf8')));

//keep server live trough port 3000 // https://stackabuse.com/how-to-start-a-node-server-examples-with-the-most-popular-frameworks/
app.listen(3000, () => console.log('Server running on port 3000.'));
