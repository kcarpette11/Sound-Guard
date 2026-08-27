// API route receives audio from the frontend 
// creates endpoints for separate files
import {Router} from "express";


// Multer handles files uploaded from the forntend. It will basically handle the audio recording
import multer from "multer";
import {analyzeAudio} from "../controllers/analyzeController"; // handles audio 



const router = Router(); // create express router

//Configures Multer

const upload = multer({
    dest: "uploads/",

});



// frontend sends audio file to the endpoint /analyze 

router.post(
    "/",

    // looks for ONE uploaded file with the field name "audio"
    // has to match what the frontend sends

    //After Multer processes the file, use req.file to access it
    upload.single("audio"),

    //analyzeAudio will check if audio file exists, upload the file, send to sound classifier, get AI Prediction
    // And return result to frontend 
    analyzeAudio
);

// Finally, export router so that server.ts can use it
export default router;