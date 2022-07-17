const express = require("express");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const stripe = require("stripe")(
  "sk_test_51L0ewEEKrvYKu07JrE6YzhNJxaZ96ylORH8jg53TCuT9L0S5Muq7STdm8DBHE6l4776mDX2PE9wOVTW4kUcIUjLz00lBHG5xKP"
);
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
    const doctorCollection = client.db("dent_care").collection("doctors");
    const paymentCollection = client.db("dent_care").collection("payments");

    // Verify admin
    const verifyAdmin = async (req, res, next) => {
      const requestorEmail = req.decoded.email;
      const requestorAccount = await userCollection.findOne({
        email: requestorEmail,
      });
      if (requestorAccount.role === "admin") {
        next();
      } else {
        return res.status(403).send({ message: "Forbidden Access" });
      }
    };
    // Stripe Create a PaymentIntent [CheckoutForm.js]
    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      const service = req.body;
      const price = service.price;
      const amount = price * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });
    // Update booking payment info [CheckoutForm.js]
    app.patch("/booking/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const payment = req.body;
      const filter = { _id: ObjectId(id) };
      const updateDoc = {
        $set: { paid: true, transactionId: payment.transactionId },
      };

      const updatedBooking = await bookingCollection.updateOne(
        filter,
        updateDoc
      );
      const result = await paymentCollection.insertOne(payment);

      res.send(updateDoc);
    });
    // Get all services
    app.get("/services", verifyJWT, async (req, res) => {
      const services = await serviceCollection
        .find()
        .project({ name: 1 })
        .toArray();
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
    // Find Booking using ID [Payment.js]
    app.get("/booking/:id", verifyJWT, async (req, res) => {
      const result = await bookingCollection.findOne({
        _id: ObjectId(req.params.id),
      });
      res.send(result);
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
    app.put("/user/admin/:email", verifyJWT, verifyAdmin, async (req, res) => {
      const filter = { email: req.params.email };
      const updateDoc = {
        $set: { role: "admin" },
      };
      const result = await userCollection.updateOne(filter, updateDoc);
      return res.send(result);
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

    //  Post Doctors Info [AddDoctor.js]
    app.post("/doctor", verifyJWT, verifyAdmin, async (req, res) => {
      const result = await doctorCollection.insertOne(req.body);
      res.send({ success: true, result });
    });
    // Get all doctors Data [ManageDoctors.js]
    app.get("/doctor", verifyJWT, verifyAdmin, async (req, res) => {
      const doctors = await doctorCollection.find().toArray();
      res.send(doctors);
    });
    // Delete a particular doctor [DeleteDoctorModel.js]
    app.delete("/doctor/:email", verifyJWT, verifyAdmin, async (req, res) => {
      const result = await doctorCollection.deleteOne({
        email: req.params.email,
      });
      res.send(result);
    });
    // Delete a particular User [AllUsersRow.js]
    app.delete("/user/:email", verifyJWT, verifyAdmin, async (req, res) => {
      const result = await userCollection.deleteOne({
        email: req.params.email,
      });
      res.send(result);
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
