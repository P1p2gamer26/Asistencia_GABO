package co.edu.ggm.asistencia.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ViewControllerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Reenvia las rutas de React Router al index de la SPA.
 * El patron excluye lo que lleva punto (ficheros como .js o .png, que deben dar
 * 404 de verdad si no existen) y no toca /api, que resuelve antes por especifico.
 */
@Configuration
public class SpaConfig implements WebMvcConfigurer {

    @Override
    public void addViewControllers(ViewControllerRegistry registry) {
        registry.addViewController("/{ruta:[^\\.]*}").setViewName("forward:/index.html");
    }
}
