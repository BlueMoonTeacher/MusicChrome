# Cloud Run용 정적 피아노 (nginx, PORT=8080)
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html piano.html styles.css app.js /usr/share/nginx/html/

EXPOSE 8080
