const net = require('net');
const udp = require('dgram');
const pcapp = require('pcap-parser');

const settings = {
  select: 2,
  tcp: {
    1: 54,
    2: 66
  },
  udp: {
    1: 42,
    2: 42,
  },
  port: {
    1: 2068,
    2: 2080,
  },
}

const parser = pcapp.parse(`./rtsp_${settings.select}.log`);

const store = {
  tcp: [],
  udp: [],
  headers: [],
  stream: {},
};


console.log('...loading');

parser.on('packet', packet => {
  if (packet.data[23] === 6) {
    store.tcp.push(packet);
  }

  if (packet.data[23] === 17) {
    store.udp.push(packet);
  }
});

parser.on('end', packet => {
  console.log(`...complete TCP: ${store.tcp.length}`);
  console.log(`...complete UDP: ${store.udp.length}\r\n`);
  start();
});

function findHeaders() {
  store.tcp
    .forEach(item => {
      const temp = item.data.slice(settings.tcp[settings.select]).toString();
      if (temp.length > 100 && temp.slice(0, 4) === 'RTSP' ) {
        store.headers.push(temp)
      }
    })
}

function parseHeaders() {
  store.headers = store.headers
    .map(item => {
      if (item.search('Content-Length: ') !== -1) {
        const index_a = item.search('m=audio');
        if (index_a !== -1) {
          const temp1 = item.slice(0, index_a);
          const temp2 = item.slice(index_a, item.length - 4);
          const temp3 = temp2.split('\r\n').map(i => 'z' + i.slice(1)).join('\r\n');

          return temp1 + temp3 + '\r\n\r\n';
        }
      }
      return item;
    });
}

function startStream(socket, info) {
  console.log('stream: ', info.address, info.port)
  let i = 0;
  const l = store.udp.length;
  setTimeout(() => {
    const timer = setInterval(() => {
      if (i >= l) {
        clearInterval(timer);
      } else {
        const temp = store.udp[i].data.slice(settings.udp[settings.select]);
        // const temp1 = new Buffer.concat([temp.slice(0, 8), new Buffer('75e5e64b', 'hex'),temp.slice(12)]);
        // console.log(temp);
        socket.send(temp, info.port, info.address);
        i++;
      }
    }, 1000 / 200);
  }, 1500);
}

function start() {
  const serverudp = udp.createSocket('udp4');
  serverudp.on('message', (msg, info) => {
    const id = info.address + info.port;
    if (store.stream[id] !== true) {
      store.stream[id] = true;
      startStream(serverudp, info);
    }
  });

  const server = net.createServer(socket => {
    let i = 0;
    let play = false;
    socket.on('data', data => {
      if (play === false) {
        const temp = data.toString().slice(0, 4);
        if (temp === 'PLAY') {
          play = true;
        }
        // console.log(data.toString(), '\r\n');
        console.log(store.headers[i], '\r\n');
        socket.write(store.headers[i])
        i++;
      }
    });

    socket.on('close', () => {
      console.log('----close----', '\r\n');
    });
  });

  serverudp.bind(settings.port[settings.select]);
  server.listen(554, () => {
    findHeaders();
    parseHeaders();
  });
}
