import './style.css';

// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore, doc, collection, addDoc, setDoc, updateDoc, getDoc, onSnapshot } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "videocall-2cede.firebaseapp.com",
  projectId: "videocall-2cede",
  storageBucket: "videocall-2cede.firebasestorage.app",
  messagingSenderId: "814118952341",
  appId: "1:814118952341:web:a33634814fc8e6908c6a9c",
  measurementId: "G-QPF0FG4CGN"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const firestore = getFirestore(app);

const servers = {
  iceServers: [
    { urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] },
  ],
  iceCandidatePoolSize: 10,
};

// Global State
const pc = new RTCPeerConnection(servers);
let localStream = null;
let remoteStream = null;

// HTML elements
const webcamButton = document.getElementById('webcamButton');
const webcamVideo = document.getElementById('webcamVideo');
const callButton = document.getElementById('callButton');
const callInput = document.getElementById('callInput');
const answerButton = document.getElementById('answerButton');
const remoteVideo = document.getElementById('remoteVideo');
const hangupButton = document.getElementById('hangupButton');

// 1. Setup media sources
webcamButton.onclick = async () => {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  remoteStream = new MediaStream();

  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream);
  });

  pc.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => {
      remoteStream.addTrack(track);
    });
  };

  webcamVideo.srcObject = localStream;
  remoteVideo.srcObject = remoteStream;

  callButton.disabled = false;
  answerButton.disabled = false;
  webcamButton.disabled = true;
};

// 2. Create an offer
callButton.onclick = async () => {
  // Create a new call doc in Firestore
  const callDocRef = doc(collection(firestore, 'calls'));
  const offerCandidatesColRef = collection(callDocRef, 'offerCandidates');
  const answerCandidatesColRef = collection(callDocRef, 'answerCandidates');

  callInput.value = callDocRef.id;

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      addDoc(offerCandidatesColRef, event.candidate.toJSON());
    }
  };

  const offerDescription = await pc.createOffer();
  await pc.setLocalDescription(offerDescription);

  const offer = {
    sdp: offerDescription.sdp,
    type: offerDescription.type,
  };

  await setDoc(callDocRef, { offer });

  // Listen for remote answer
  onSnapshot(callDocRef, (snapshot) => {
    const data = snapshot.data();
    if (!pc.currentRemoteDescription && data?.answer) {
      const answerDescription = new RTCSessionDescription(data.answer);
      pc.setRemoteDescription(answerDescription);
    }
  });

  // When answered, add candidate to peer connection
  onSnapshot(answerCandidatesColRef, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const candidateData = change.doc.data();
        pc.addIceCandidate(new RTCIceCandidate(candidateData));
      }
    });
  });

  hangupButton.disabled = false;
};

// 3. Answer the call
answerButton.onclick = async () => {
  const callId = callInput.value;
  const callDocRef = doc(firestore, 'calls', callId);
  const answerCandidatesColRef = collection(callDocRef, 'answerCandidates');
  const offerCandidatesColRef = collection(callDocRef, 'offerCandidates');

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      addDoc(answerCandidatesColRef, event.candidate.toJSON());
    }
  };

  const callDocSnap = await getDoc(callDocRef);
  const callData = callDocSnap.data();

  const offerDescription = callData.offer;
  await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

  const answerDescription = await pc.createAnswer();
  await pc.setLocalDescription(answerDescription);

  const answer = {
    type: answerDescription.type,
    sdp: answerDescription.sdp,
  };

  await updateDoc(callDocRef, { answer });

  onSnapshot(offerCandidatesColRef, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        let candidateData = change.doc.data();
        pc.addIceCandidate(new RTCIceCandidate(candidateData));
      }
    });
  });
};
