'use strict';

const protoLoader = require('@grpc/proto-loader');
const grpc = require('grpc');

const PROTO_PATH = __dirname + '../../../lib/frameland/landpack/landmarks.proto';
const packageDefinition =
    protoLoader.loadSync(
        PROTO_PATH, {
            keepCase: true,
            longs: String,
            enums: String,
            defaults: true,
            oneofs: true
        }
    );

const frameland = grpc.loadPackageDefinition(packageDefinition).frameland;
const handDetectionClient = new frameland.HandDetection('localhost:50055', grpc.credentials.createInsecure());


const { EventEmitter } = require('events');

const {
  createCanvas,
  createImageData
} = require('canvas');

const {
  RTCVideoSink,
  RTCVideoSource,
  i420ToRgba,
  rgbaToI420
} = require('wrtc').nonstandard;

const width = 640;
const height = 480;

const broadcaster = new EventEmitter();
const { on } = broadcaster;

function beforeOffer(peerConnection) {
  const audioTrack = broadcaster.audioTrack = peerConnection.addTransceiver('audio').receiver.track;
  // const videoTrack = broadcaster.videoTrack = peerConnection.addTransceiver('video').receiver.track;

  //-----------------------------------------------------
  const source = new RTCVideoSource();
  const track = source.createTrack();
  const transceiver = peerConnection.addTransceiver(track);
  const sink = new RTCVideoSink(transceiver.receiver.track);
  broadcaster.videoTrack = track;

  let lastFrame = null;

  function onFrame({ frame }) {
    lastFrame = frame;
  }

  sink.addEventListener('frame', onFrame);

  // TODO(mroberts): Is pixelFormat really necessary?
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  context.fillStyle = 'white';
  context.fillRect(0, 0, width, height);

  let hue = 0;

  const delay = 33.33; // miliseconds
    const interval = setInterval(() => {
        if (lastFrame) {
            
            const lastFrameCanvas = createCanvas(lastFrame.width, lastFrame.height);
            const lastFrameContext = lastFrameCanvas.getContext('2d');
            
            const rgba = new Uint8ClampedArray(lastFrame.width * lastFrame.height * 4);
            const rgbaFrame = createImageData(rgba, lastFrame.width, lastFrame.height);
            i420ToRgba(lastFrame, rgbaFrame);
            
            lastFrameContext.putImageData(rgbaFrame, 0, 0);
            context.drawImage(lastFrameCanvas, 0, 0);
        } else {
            context.fillStyle = 'rgba(255, 255, 255, 0.025)';
            context.fillRect(0, 0, width, height);

            // const rgbaFrame = context.getImageData(0, 0, width, height);
            // const i420Frame = {
            //     width,
            //     height,
            //     data: new Uint8ClampedArray(1.5 * width * height)
            // };
            // rgbaToI420(rgbaFrame, i420Frame);
            // source.onFrame(i420Frame);
        }

        const pixelData = context.getImageData(0, 0, width, height);

        const image = {
            data: new Uint8Array(pixelData.data),
            channels: 4,
            width: pixelData.width,
            height: pixelData.height
        };

        let request = {
            image: image
        }

        handDetectionClient.detectAndDraw(request, {}, (err, response) => {

            if (err) {
                console.log(err);
                return;
            }

            const image = response.image;
            const imageData = createImageData(
                new Uint8ClampedArray(image.data),
                image.width, image.height
            );
            context.putImageData(imageData, 0, 0);

            const rgbaFrame = context.getImageData(0, 0, width, height);
            const i420Frame = {
                width,
                height,
                data: new Uint8ClampedArray(1.5 * width * height)
            };
            rgbaToI420(rgbaFrame, i420Frame);
            source.onFrame(i420Frame);
            
        });

    }, delay);

  //-----------------------------------------------------

  broadcaster.emit('newBroadcast', {
    audioTrack,
    track
  });

  const { close } = peerConnection;
  peerConnection.close = function() {
    clearInterval(interval);
    audioTrack.stop();
    track.stop();
    sink.stop();
    return close.apply(this, arguments);
  };
}

module.exports = { 
  beforeOffer,
  broadcaster
};
