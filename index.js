const express = require("express");
const { MongoClient, ServerApiVersion } = require("mongodb");
const jwt = require("jsonwebtoken");
const cors = require("cors");
require("dotenv").config();
const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

//MongoDB Connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.a1mho.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

// Verifying Token From User
const verifyJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "UnAuthorize Access" });
  }

  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: "Forbidden Access" });
    }
    req.decoded = decoded;
    next();
  });
};

// All operations
async function run() {
  try {
    await client.connect();
    const serviceCollection = client.db("dent_care").collection("services");
    const bookingCollection = client.db("dent_care").collection("bookings");
    const userCollection = client.db("dent_care").collection("users");
    // Get all services
    app.get("/services", async (req, res) => {
      const services = await serviceCollection.find().toArray();
      res.send(services);
    });
    // Post booking from user [BookingModal.js]
    app.post("/booking", async (req, res) => {
      const booking = req.body;
      const query = {
        treatmentName: booking.treatmentName,
        date: booking.date,
        patientName: booking.patientName,
      };
      const exists = await bookingCollection.findOne(query);
      if (exists) {
        return res.send({ success: false, booking: exists });
      }
      const result = await bookingCollection.insertOne(booking);
      return res.send({ success: true, booking: result });
    });
    // Set available slots on a particular date [AvailableAppointment.js]
    app.get("/available", async (req, res) => {
      const date = req.query.date;

      const services = await serviceCollection.find().toArray();
      const bookingsOnThatDay = await bookingCollection
        .find({ date })
        .toArray();

      services.map((service) => {
        const bookingsOnThatService = bookingsOnThatDay.filter(
          (b) => b.treatmentName === service.name
        );
        const bookingSlots = bookingsOnThatService.map((s) => s.slot);
        service.bookedSlots = bookingSlots;
        service.slots = service.slots.filter((s) => !bookingSlots.includes(s));
      });

      res.send(services);
    });
    //Get all bookings of a particular user [MyAppointments.js]
    app.get("/booking", verifyJWT, async (req, res) => {
      if (req.decoded.email === req.query.email) {
        const result = await bookingCollection
          .find({ patientEmail: req.query.email })
          .toArray();
        return res.send(result);
      } else {
        return res.status(403).send({ message: "Forbidden Access" });
      }
    });

    //Save all users (signUP) info in database [useToken.js]
    app.put("/user/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await userCollection.updateOne(filter, updateDoc, options);
      const token = jwt.sign(
        { email: email },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: "1h" }
      );
      res.send({ result, token });
    });
    //Make a user admin [AllUsersRow.js]
    app.put("/user/admin/:email", verifyJWT, async (req, res) => {
      const filter = { email: req.params.email };
      const requestorEmail = req.decoded.email;
      const requestorAccount = await userCollection.findOne({
        email: requestorEmail,
      });
      if (requestorAccount.role === "admin") {
        const updateDoc = {
          $set: { role: "admin" },
        };
        const result = await userCollection.updateOne(filter, updateDoc);
        return res.send(result);
      } else {
        return res.status(403).send({ message: "Forbidden Access" });
      }
    });

    //Check user admin or not [useAdmin.js]
    app.get("/user/:email", verifyJWT, async (req, res) => {
      const user = await userCollection.findOne({
        email: req.params.email,
      });
      const isAdmin = user.role === "admin";
      res.send({ admin: isAdmin });
    });
    //  Get All Users [AllUsers.js]
    app.get("/users", verifyJWT, async (req, res) => {
      const users = await userCollection.find().toArray();
      res.send(users);
    });
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello from Dent Care");
});

app.listen(port, () => {
  console.log(`Dent Care app listening on port ${port}`);
});
