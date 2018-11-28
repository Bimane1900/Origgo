var express = require('express'); // https://expressjs.com/en/guide/routing.html
var mysql = require('mysql');// https://www.npmjs.com/package/mysql
var bodyParser = require('body-parser');// https://www.npmjs.com/package/body-parser
var fs = require('fs'); // https://www.w3schools.com/nodejs/nodejs_filesystem.asp
var db = require('./DBinfo');
var https = require('https');
var session = require('express-session');
var app = express();
const uuidv4 = require('uuid/v4');
uuidv4(); // ⇨ '10ba038e-48da-487b-96e8-8d3b99b6d18a'

var crypto;
try {
  crypto = require('crypto');
} catch (err) {
  console.log('crypto support is disabled!');
}

//session cookie setting lives for 1h
app.use(session({secret: 'ALDO4923ALFO2QIA', resave: false, saveUninitialized : true, cookie:{ maxAge: 3600000}}));

//sets connection to Database with the specifics given from DBinfo.js
var connection = mysql.createConnection(db.connectionstring);

//use for complex json parsing
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

//allows for navigation from exteral ip(gateway), not needed if ran on localhost
app.use(function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});


//makes a promise for sequential execution for database
var DatabaseConn = function(queryString){
  return new Promise(function(resolve, reject) { 
  connection.query(queryString,(error, results, fields) => {  
      if (error) return reject(error);
      return resolve(results);
    });
  });
};
  
app.post('/loginbtn',(req, res) =>{
  console.log(req.body.emptype);
  if (req.body.emptype == "employee") { //check if its first time emoplyee logs in
    DatabaseConn("SELECT origgo.employee.password FROM origgo.employee WHERE name= '"+req.body.Name+"';").then(function(data){
      if (data[0].password == null) {
        res.send("goPass");
      }
    });
  }
  const hash = crypto.createHmac('sha256', req.body.Pass).digest('hex');
  const QueryString = (req.body.emptype == "employer") ? "SELECT origgo.employer.UID, origgo.employer.name, origgo.employer.password FROM origgo.employer WHERE name= '"+req.body.Name+"' AND password='"+hash+"'" : "SELECT origgo.employee.UID, origgo.employee.name, origgo.employee.password FROM origgo.employee WHERE name= '"+req.body.Name+"' AND password = '"+req.body.Pass+"';";//_-------- CHANGE PASS TO HASH AFTER DEBUGGING IS DONE
  console.log(QueryString);
  DatabaseConn(QueryString).then(function(data){
    console.log("DATA: ",data);
    if (data.length > 0){
     req.session.login = true;
     req.session.name = data[0].name;
     req.session.userId = data[0].UID;
     req.session.usertype = req.body.emptype;
    }
  console.log("req.session: ",req.session.login,"\nreq:",req.body.Name, req.body.Pass, req.body.emptype); 
  res.send(req.session.login);
  })  
});

app.post('/signupForm', (req, res) =>{
  const hash = crypto.createHmac('sha256', req.body.Password).digest('hex');
  const QueryString = 'INSERT INTO `origgo`.`employer` (`name`, `password`, `email`, `companyName`, `certifiedKey`) VALUES ('+'"'+req.body.Username+'"'+', '+'"'+hash+'"'+', '+'"'+req.body.Mail+'"'+', '+'"'+req.body.CompSelector+'"'+', '+'"'+req.body.keycode+'"'+');';
  const QueryStringCheck = "SELECT count(*) AS HITS FROM origgo.company_code WHERE company = '"+req.body.CompSelector+"' AND code = '"+req.body.keycode+"';"
  DatabaseConn(QueryStringCheck).then(function(data){
    if (data[0].HITS) {
      DatabaseConn(QueryString).then(function(row){
      res.send(row.affectedRows.toString());
      }).catch(function(error){console.log(error);}) 
    }else{
      res.send(data[0].HITS.toString())
    }
  }).catch(function(error){console.log(error);})
});


app.post('/check',(req, res) =>{
    if(req.session.login) {
      const query = "SELECT * FROM origgo.usersavedplanes WHERE UID = '"+req.session.userId+"';";
      DatabaseConn(query).then(function(rows){
        console.log("rows: ", rows);

        if(rows.length > 0){
          let userData = { plane : rows[0].Icao24, username : req.session.name };
          res.send(userData);
        }
        else res.send(req.session.name);
      }).catch(function(){
        res.send(false);
      })
      }
    else res.send("");
});


app.get('/search', function(req, res){
  if(req.query.q!="") {
      connection.query("select * from airport where city like '%" + req.query.q + "%'", (err, rows, fields) => {
          if (err) console.log(err);
          if (Object.keys(rows).length){
            console.log(rows[0].city);
          } else {
              // queryRes = ;
          }
          res.send(rows);
      });
  }else{queryRes = "{\"No Match\"}"}
      console.log("req.body: ", req.body, "req.query: ", req.query);
      //res.send(queryRes);
})

app.get('/logout',function(req,res) {
    req.session.destroy(function (err) {
        if (err) {
            console.log(err);
        } else {
            res.redirect('/');
        }
    });
});


app.get('/signup.html',(req, res) =>{//makes sure user dont reach signup if logedin
    if (req.session.login) {
      res.redirect('/');
    }else{
      res.send(fs.readFileSync(__dirname + '/../public/signup.html', 'utf8'));//go to signup
    }
});

app.get('/login.html',(req, res) =>{
    if (req.session.login) {
      res.redirect('/');
    }else{
      res.send(fs.readFileSync(__dirname + '/../public/login.html', 'utf8'));
    }
});

/*Sends all current non-null airplanes to client*/
app.get('/addAirplanes', (req, res) => {
  request("https://opensky-network.org/api/states/all", function(data){
    var states = data.states || undefined;
    var planes = [];
    if(states){
      states.forEach(function(plane){
        /*Boolean if plane is on ground*/
        var planeGrounded = plane[8];
        /*Indexes 5,6 contains coordinates for the plane*/
        var lat = plane[6];
        var lon = plane[5];
        if(!planeGrounded && lat && lon && plane[1]!=""){

          /*Index 10 contains plane rotation in degrees
          North is 0 degrees. Index 0 has unique icao24 code*/
          var planeObject = { 
            icao24: plane[0],
            callsign: plane[1].trim(),
            lat: lat,
            lon: lon,
            direction: plane[10],
             };
          planes.push(planeObject);
        }
      });
      console.log("States true");
    }
    else{
      console.log("States null");
    }
    res.send(planes);
  });
});

// app.get('/addHeatmap', (req, res) => {
//     request("https://opensky-network.org/api/states/all", function(data){
//
//         var planeObject = "{ \"type\": \"MultiPoint\",\"coordinates\": ["
//         if(data){
//             data["states"].forEach(function(plane){
//                 /*Boolean if plane is on ground*/
//                 var planeGrounded = plane[8];
//                 /*Indexes 5,6 contains coordinates for the plane*/
//                 var lat = plane[6];
//                 var lon = plane[5];
//                 if(!planeGrounded && lat && lon && plane[1]!=""){
//                     console.log(lat);
//                     /*Index 10 contains plane rotation in degrees
//                     North is 0 degrees. Index 0 has unique icao24 code*/
//                     planeObject = planeObject + "[" + lat + "," + lon + "],";
//                 }
//             });
//             planeObject = planeObject.slice(0,-1) + "]";
//             planeObject = planeObject + "}";
//
//             console.log(planeObject);
//         }
//         else{
//             console.log("States null");
//         }
//         res.send(planeObject);
//     });
// });

//gets a bunch of info on a plane
app.get('/getAirplane', (req, res) => {
  let data = {};
      request("https://opensky-network.org/api/states/all?icao24="+req.query.q, function(statesData) {
        if(statesData.states){
            let plane = statesData.states[0];
            //Time in unix stamp, 43200 is 12 hours
            let currentTime = Math.floor(Date.now()/1000);
            let begin =  currentTime - 43200;
            let end = currentTime + 43200;
            request("https://opensky-network.org/api/flights/aircraft?icao24="+req.query.q+"&begin="+begin+"&end="+end, function(flightsData){ 
              data = { 
                icao24 : plane[0],
                estArrival : unixTimeToNormal(flightsData[0].lastSeen),
                estDeparture : unixTimeToNormal(flightsData[0].firstSeen),
                callsign : flightsData[0].callsign.trim(),
                velocity : plane[9],
                origin : plane[2],
                altitude : plane[7]
              };   
              DatabaseConn("SELECT * FROM origgo.airport WHERE icaoCode = '"+flightsData[0].estDepartureAirport+"'").then(function(airport){
                if(airport.length > 0) { 
                  data.depatureAirport = { 
                      iataCode : airport[0].iataCode, 
                      city : airport[0].city,
                      country : airport[0].country }
                }else 
                  data.depatureAirport = flightsData[0].estDepartureAirport;       
                DatabaseConn("SELECT * FROM origgo.airport WHERE icaoCode = '"+flightsData[0].estArrivalAirport+"'").then(function(airport){
                  if(airport.length > 0) { 
                    data.arrivalAirport = { 
                      iataCode : airport[0].iataCode, 
                      city : airport[0].city,
                      country : airport[0].country }
                  }else 
                    data.arrivalAirport = flightsData[0].estArrivalAirport;
                  console.log("DATA: \n", data);
                  res.send(data);
                });
              });          
            });
          }
          else {res.send("")}
      });
});

function unixTimeToNormal(unix){
  let date = new Date(unix*1000);
  return date.getHours()+":"+date.getMinutes();
}

app.get('/flightToDB', (req, res) => {
  if(req.session.login){
    const query = "INSERT INTO origgo.usersavedplanes (UID, Icao24) VALUES ('"+req.session.userId+"', '"+req.query.icao24+"');";
    DatabaseConn(query).then(function(){
      res.send(true);
    }).catch(function(){
      res.send(false);
    })
  }
  else { res.send(false); }
});

app.get('/updateFlightToDB', (req, res) => {
  if(req.session.login){
    const query = "UPDATE origgo.usersavedplanes SET icao24 = '"+req.query.icao24+"' WHERE UID = '"+req.session.userId+"';";
    DatabaseConn(query).then(function(){
      res.send(true);
    }).catch(function(){
      res.send(false);
    })
  }
  else { res.send(false); }
});

app.get('/checkUserSaved', (req, res) => {
  if(req.session.login){
    const query = "SELECT * FROM origgo.usersavedplanes WHERE UID = '"+req.session.userId+"';";
    DatabaseConn(query).then(function(rows){
      if(rows.length > 0) res.send(true);
      else res.send(false);
    }).catch(function(){
      res.send(false);
    })
  }
  else { res.send(false); }
  
});

/*function for accessing WEB API through https module,
see it as serverside making requests to services*/
function request(link, func){
  var req = https.request(link, function(res){
    //console.log(res.statusCode);
    if(res.statusCode == 301){
      request(res.headers.location, func);
    }
    else if(res.statusCode == 200){
      var datastring = "";
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
