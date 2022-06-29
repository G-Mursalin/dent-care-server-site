const express = require("express");
const { MongoClient, ServerApiVersion } = require("mongodb");
const cors = require("cors");
const jwt = require("jsonwebtoken");
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

// All operations
async function run() {
  try {
    await client.connect();
    const serviceCollection = client.db("dent_care").collection("services");
    const bookingCollection = client.db("dent_care").collection("bookings");
    // Get all services
    app.get("/services", async (req, res) => {
      const services = await serviceCollection.find().toArray();
      res.send(services);
    });
    // Post booking from user
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
    // Set available slots on a particular date
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
    //Get all bookings of a particular user
    app.get("/booking", async (req, res) => {
      const result = await bookingCollection
        .find({ patientEmail: req.query.email })
        .toArray();
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
