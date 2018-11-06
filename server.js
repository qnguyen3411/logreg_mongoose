const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const mongoose = require('mongoose');
const _ = require('lodash');
const flash = require('express-flash');
const session = require('express-session');
const bcrypt = require('bcryptjs')
const dateFormat = require('dateformat');


const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, './public')));
app.use(flash());
app.set('views', path.join(__dirname, './views'));
app.set('view engine', 'ejs');
app.set('trust proxy', 1) // trust first proxy

app.use(session({
  secret: 'keyboard cat',
  resave: false,
  saveUninitialized: true,
  cookie: { 
    maxAge: 60000000 
  }
}))

mongoose.connect('mongodb://localhost/logreg');
mongoose.Promise = global.Promise;

var validateEmail = function(email) {
  var re = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
  return re.test(email)
};

var validateDate = function(date) {
  const now = new Date()
  return date < now;
} 
// SECTION DB

const CommentSchema = new mongoose.Schema({
  content: {type: String, required: true, minlength: 2}
})

const SecretSchema = new mongoose.Schema({
  content: {type: String, required: true, minlength: 2},
  comments: [CommentSchema]
})

const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    trim: true,
    lowercase: true,
    unique: true,
    required: 'Email address is required',
    validate: [validateEmail, 'Your email is invalid'],
    match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please fill a valid email address']
  },
  firstName: {
    type: String,
    required: 'First name required',
    minlength: 2
  },
  lastName: {
    type: String,
    required: 'Last name required',
    minlength: 2
  },
  passwordHash: {
    type: String,
    required: true,
  },
  birthDay: {
    type: Date,
    required: 'Birthday required',
    validate: [validateDate, 'Your birthday is invalid'],
  },
  secrets: [SecretSchema]
})



mongoose.model('Comment', CommentSchema);
mongoose.model('Secret', SecretSchema);
mongoose.model('User', UserSchema);
const Comment = mongoose.model('Comment');
const Secret = mongoose.model('Secret');
const User = mongoose.model('User');

// !SECTION 

// SECTION ROUTES

// SECTION LOGREG

app.get('/', (req, res) => {
  res.send("SUP BRAH");
});

// GET login
app.get('/login', (req, res) => {
  res.render('login');
})
// GET reg
app.get('/registration', (req, res) => {
  res.render('registration');
})
// GET success
app.get('/success', (req, res) => {
 
  res.send('U DID IT!!!!!!!! <a href="/logout">Logout</a>');
});
// POST login
app.post('/login', (req, res) => {
  User.findOne({email: req.body.email})
  .then(match => {
    if(!match) { 
      throw {message: 'EMAIL NoooooOOOO MATCHEY'}
    }
    req.session.user_id = match._id;
    req.session.email = match.email;
    return bcrypt.compare(req.body.password, match.passwordHash)
  }).then(passwordMatch => {
    if(!passwordMatch) {
      req.session.destroy()
      throw {message: 'PASSWORD NOOO MATCHEY'};
    }
    res.redirect('/secrets')
  }).catch(err => {
    console.log(err)
    req.flash('login', 'Username/password invalid')
    res.redirect('/login')
  })
})

app.get('/logout', (req, res) => {
  req.session.destroy()
  res.redirect('/login')
})

// POST reg
app.post('/registration', (req, res) => {
  registerPasswordHash(req.body)
    .then(hashedPassword => {
      const user = new User({
        email: req.body.email,
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        passwordHash: hashedPassword,
        birthDay: Date(req.body.birthDay)
      })
      return user.save()
    }).then(user => {
      req.session.user_id = user._id;
      req.session.email = user.email;
      res.redirect('/secrets')
    }).catch(err => {
      for(var key in err.errors){
        req.flash('registration', err.errors[key].message);
      }
      res.redirect('/registration')
    })
})

// !SECTION LOGREG

//SECTION SECRETS
app.get('/secrets', (req, res) => {
  console.log(`${req.session.user_id}`)
  User.find().then(users => {
    return users.reduce((soFar, user) => {
      user.secrets.forEach(secret => {
        soFar.push({userId: user._id, content: secret.content, id: secret._id})
      });
      return soFar;
    }, [])
  }).then(result => {
    console.log(result)
    res.render('index', {secrets: result, selfId: req.session.user_id})
  }).catch(err => {
    console.log(err)
    res.render('index', {secrets: [], selfId: req.session.user_id})
  })
})

app.get('/secrets/:id', (req, res) => {
  Secret.findById(req.params.id)
  .then(secret => {
    res.render('secret', {secret: secret})
  }).catch(err => {
    console.log(err)
    res.redirect('/secrets')
  })
  // res.render('secret')
})
// POST SECRET
app.post('/secrets/', (req, res) => {
  console.log(`FINDING USER BY ID: ${req.session.user_id}`)
  const secret = new Secret(req.body);
  secret.save().then(secret => {
    return User.findByIdAndUpdate(
      {_id: req.session.user_id }, 
      {$push: {secrets: secret}}
      )
  }).then(user => {
    console.log(`DID IT: ${user}`)
  }).catch(err => {
    console.log("RUH ROH")
    console.log(err)
  })
  res.redirect('/secrets')
})
// POST COMMENT
app.post('/secrets/:id', (req, res) => {
  console.log(req.body)
  const comment = new Comment(req.body);
  comment.save().then(comment => {
    // console.log(comment)
    return Secret.findByIdAndUpdate(
      req.params.id, 
      {$push: {comments: comment}}
    )
  }).then(comment => {
    console.log(`DID IT: ${comment}`)
  }).catch(err => {
    console.log(err)
  })

  res.redirect(`/secrets/${req.params.id}`)
})

app.get('/secrets/delete/:id', (req, res) => {
  console.log("TRYING TO DELETE")
  User.findById(req.session.user_id).then(user => {
    user.secrets.id(req.params.id).remove()
    return user.save();
  }).then(result => {
    return Secret.findByIdAndRemove(req.params.id)
  }).catch(err => {
    console.log(err)
  })
  res.redirect('/secrets')
})
// !SECTION SECRETS 

// !SECTION ROUTES

app.listen(8000, ()=> {
  console.log('LISTENING TO PORT 8000')
})

// HELPERS

var registerPasswordHash = function(data) {
  const password = data.password;
  const confirm = data.confirm;
  if (!password || !confirm) {  return Promise.reject({message: 'PASSWORD AINT THERE'}); }
  if (password != confirm) { return Promise.reject({message: 'PASSWORD NOO MATCHEY'}); }
  return bcrypt.hash(password, 10);
}
