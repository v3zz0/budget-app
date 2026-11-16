// Build + deploy di budget-api sulla VM docker-lavoro (agente Jenkins 'docker-vezzo')
// Password e chiavi: SOLO nella credenziale Jenkins 'budget-api-env' (= .env.production)
// L'immagine va sul registry PRIVATO di Gitea (prima era su ghcr pubblico, con il .env dentro).
pipeline {
    agent { label 'docker-vezzo' }

    environment {
        REGISTRY       = "g.vezzo.vp360web.com"
        IMAGE          = "g.vezzo.vp360web.com/vezzo/budget-api"
        CONTAINER_NAME = "budget-api"
        VERSION        = "${env.BUILD_NUMBER}"
    }

    stages {
        stage('Checkout') {
            steps { checkout scm }
        }

        stage('Prepare env') {
            steps {
                withCredentials([file(credentialsId: 'budget-api-env', variable: 'ENV_FILE')]) {
                    sh 'rm -f .env.production && cp "$ENV_FILE" .env.production'
                }
            }
        }

        stage('Build') {
            steps {
                // il .dockerignore tiene fuori .env e .env.production: nell'immagine non entrano segreti
                sh 'docker build -t $IMAGE:$VERSION -t $IMAGE:latest .'
            }
        }

        stage('Push') {
            steps {
                withCredentials([usernamePassword(credentialsId: 'gitea-registry', usernameVariable: 'REG_USER', passwordVariable: 'REG_PASS')]) {
                    sh '''
                        echo "$REG_PASS" | docker login $REGISTRY -u "$REG_USER" --password-stdin
                        docker push $IMAGE:$VERSION
                        docker push $IMAGE:latest
                    '''
                }
            }
        }

        stage('Deploy') {
            steps {
                sh '''
                    docker stop $CONTAINER_NAME || true
                    docker rm $CONTAINER_NAME || true
                    docker run -d \
                        --name $CONTAINER_NAME \
                        --network lavoro-net \
                        -p 1337:1337 \
                        -v /DATA/AppData/budgetapi:/app/public/uploads \
                        --env-file .env.production \
                        --restart unless-stopped \
                        $IMAGE:$VERSION
                '''
            }
        }

        stage('Verifica') {
            steps {
                // aspetta che Strapi risponda su /_health (max ~3 minuti), altrimenti mostra i log
                sh '''
                    for i in $(seq 1 36); do
                        if docker exec $CONTAINER_NAME wget -q -O /dev/null http://127.0.0.1:1337/_health; then
                            echo "Strapi risponde (tentativo $i)"; exit 0
                        fi
                        sleep 5
                    done
                    echo "Strapi non risponde: ultimi log"
                    docker logs --tail 60 $CONTAINER_NAME
                    exit 1
                '''
            }
        }

        stage('Pulizia immagini') {
            steps {
                // tiene solo le ultime 3 build
                sh '''
                    docker images $IMAGE --format '{{.Tag}}' | grep -E '^[0-9]+$' | sort -rn | tail -n +4 | xargs -r -I{} docker rmi $IMAGE:{} || true
                    docker image prune -f || true
                '''
            }
        }
    }

    post {
        success { echo "Deploy di budget-api build ${VERSION} completato" }
        failure { echo "Pipeline fallita, controllare i log" }
        always {
            sh 'rm -f .env.production'
            sh 'docker logout $REGISTRY || true'
        }
    }
}
