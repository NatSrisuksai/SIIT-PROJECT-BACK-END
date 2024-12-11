import express from "express";
import { MongoClient, ObjectId, ServerApiVersion } from "mongodb";
import cors from "cors";
import bodyParser from "body-parser";
import { v4 as uuidv4 } from "uuid";
import dotenv from 'dotenv';

dotenv.config();


const app = express();
app.use(cors());
app.use(bodyParser.json());

const uri = process.env.uri;
const dbName = "examDB";

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let db;

// Connect to MongoDB
async function connectToDatabase() {
  try {
    // Connect the client to the server
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );

    // Set the database reference
    db = client.db(dbName);
  } catch (error) {
    console.error("Failed to connect to MongoDB", error);
  }
}

connectToDatabase();

// API Endpoint to handle publish
app.post("/api/exams", async (req, res) => {
  try {
    const { title, questions } = req.body;
    const exam = { title };
    const examResult = await db.collection("exams").insertOne(exam);

    const questionsWithExamId = questions.map((question) => ({
      ...question,
      examId: examResult.insertedId,
    }));

    const questionResults = await db
      .collection("questions")
      .insertMany(questionsWithExamId);

    res.status(201).json({
      message: "Exam and questions published successfully!",
      examId: examResult.insertedId,
      questionIds: questionResults.insertedIds,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to publish exam and questions" });
  }
});

// API Endpoint to get all questions
app.get("/api/questions", async (req, res) => {
  try {
    const questions = await db.collection("questions").find().toArray();
    res.status(200).json(questions);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch questions" });
  }
});

// API Endpoint to get question text by using question id
app.get("/api/questions/:id", async (req, res) => {
  try {
    const questionId = req.params.id;
    const question = await db
      .collection("questions")
      .findOne({ _id: new ObjectId(questionId) });

    if (question) {
      res.status(200).json(question);
    } else {
      res.status(404).json({ error: "Question not found" });
    }
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch question" });
  }
});

// POST endpoint to submit answers
app.post("/api/submit-answers", async (req, res) => {
  try {
    const { answers } = req.body; // Expecting an array of answers with question IDs
    const userId = uuidv4(); // Generate a unique user ID

    const submissions = answers.map((answer) => ({
      ...answer,
      userId,
      submittedAt: new Date(),
    }));

    await db.collection("submissions").insertMany(submissions);

    res
      .status(201)
      .json({ message: "Answers submitted successfully!", userId });
  } catch (error) {
    res.status(500).json({ error: "Failed to submit answers" });
  }
});

// API Endpoint to get submissions for a specific question
app.get("/api/submissions/:questionId", async (req, res) => {
  try {
    const questionId = req.params.questionId;
    const submissions = await db
      .collection("submissions")
      .find({ questionId })
      .toArray();

    if (submissions.length > 0) {
      res.status(200).json(submissions);
    } else {
      res.status(404).json({ error: "No submissions found for this question" });
    }
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch submissions" });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
