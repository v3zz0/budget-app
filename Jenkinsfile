// Build + deploy di budget (frontend + backend) sulla VM docker-lavoro.
// Segreti e configurazione: SOLO nella credenziale Jenkins 'budget-api-env'
// (file .env, vedi .env.example): non stanno nel repository né nei log.
// Compose costruisce e ricrea solo il servizio che è cambiato.
pipeline {
    agent { label 'docker-vezzo' }

    options {
        disableConcurrentBuilds()
        timeout(time: 40, unit: 'MINUTES')
    }

    environment {
        // Dove stavano già gli upload col vecchio deploy: non cambiarlo o si perdono.
        BUDGET_UPLOADS_PATH = '/DATA/AppData/budgetapi'
    }

    stages {
        stage('Prepare env') {
            steps {
                withCredentials([file(credentialsId: 'budget-api-env', variable: 'ENV_FILE')]) {
                    sh 'set +x; rm -f .env && cp "$ENV_FILE" .env && chmod 600 .env'
                }
            }
        }

        stage('Container del vecchio deploy') {
            steps {
                // Prima del monorepo i container si creavano con `docker run`: compose non
                // li riconosce e si fermerebbe su "nome già in uso". Si tolgono solo quelli
                // non suoi (senza etichetta compose); i dati stanno nei volumi, non qui.
                sh '''
                    for c in budget-api budget-app; do
                        if docker inspect "$c" >/dev/null 2>&1 && \
                           [ -z "$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$c")" ]; then
                            echo "Rimuovo il vecchio container $c"; docker rm -f "$c"
                        fi
                    done
                '''
            }
        }

        stage('Deploy') {
            steps {
                sh '''
                    export BUDGET_TAG=$(git rev-parse --short=12 HEAD)
                    docker compose up -d --build --wait --wait-timeout 300
                    docker compose ps
                '''
            }
        }

        stage('Verifica') {
            steps {
                sh '''
                    docker compose exec -T frontend wget -q -O /dev/null http://127.0.0.1/health && echo "frontend: ok"
                    # /api passa da nginx fino a Strapi: senza token deve rispondere Strapi (401/403), non nginx (502)
                    docker compose exec -T frontend sh -c 'wget -S -O /dev/null http://127.0.0.1/api/wallets 2>&1 | grep "HTTP/" || true'
                '''
            }
        }

        stage('Pulizia immagini') {
            steps {
                // tiene le ultime 3 build di ognuna
                sh '''
                    for img in budget-api budget-app; do
                        docker images $img --format '{{.CreatedAt}}\t{{.Tag}}' | sort -r | cut -f2 | grep -v '^local$' | tail -n +4 | xargs -r -I{} docker rmi $img:{} || true
                    done
                    docker image prune -f || true
                '''
            }
        }
    }

    post {
        success { echo "Deploy di budget ${env.BUILD_NUMBER} completato" }
        failure { sh 'docker compose logs --tail 60 backend || true' }
        always  { sh 'rm -f .env' }
    }
}
